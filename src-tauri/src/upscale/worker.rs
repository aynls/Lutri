//! Rust image pipeline using only NCNN's published C ABI. No Upscayl code is linked.
use super::{Architecture, WorkerJob};
use image::{DynamicImage, ImageBuffer, ImageDecoder as _};
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_void, CString},
    io::{BufWriter, Seek, Write},
    path::Path,
    ptr,
    time::{Duration, Instant},
};
type Handle = *mut c_void;

macro_rules! api {
    ($($name:ident: fn($($arg:ty),*) $(-> $ret:ty)?;)+) => {
        struct Api { $($name: unsafe extern "C" fn($($arg),*) $(-> $ret)?,)+ _library: Library }
        impl Api {
            unsafe fn open(path: &Path) -> Result<Self, String> {
                let library = Library::new(path).map_err(|e|format!("NCNN runtime: {e}"))?;
                Ok(Self { $($name: *library.get(concat!(stringify!($name), "\0").as_bytes()).map_err(|e|e.to_string())?,)+ _library: library })
            }
        }
    }
}
api! {
    ncnn_net_create: fn() -> Handle;
    ncnn_net_destroy: fn(Handle);
    ncnn_net_get_option: fn(Handle) -> Handle;
    ncnn_option_set_use_vulkan_compute: fn(Handle,c_int);
    ncnn_option_set_num_threads: fn(Handle,c_int);
    ncnn_net_load_param_memory: fn(Handle,*const c_char) -> c_int;
    ncnn_net_get_input_count: fn(Handle) -> c_int;
    ncnn_net_get_output_count: fn(Handle) -> c_int;
    ncnn_net_get_input_name: fn(Handle,c_int) -> *const c_char;
    ncnn_net_get_output_name: fn(Handle,c_int) -> *const c_char;
    ncnn_extractor_create: fn(Handle) -> Handle;
    ncnn_extractor_destroy: fn(Handle);
    ncnn_extractor_input: fn(Handle,*const c_char,Handle) -> c_int;
    ncnn_extractor_extract: fn(Handle,*const c_char,*mut Handle) -> c_int;
    ncnn_mat_from_pixels: fn(*const u8,c_int,c_int,c_int,c_int,Handle) -> Handle;
    ncnn_mat_destroy: fn(Handle);
    ncnn_mat_get_w: fn(Handle) -> c_int;
    ncnn_mat_get_h: fn(Handle) -> c_int;
    ncnn_mat_get_c: fn(Handle) -> c_int;
    ncnn_mat_get_data: fn(Handle) -> *mut c_void;
    ncnn_mat_get_dims: fn(Handle) -> c_int;
    ncnn_mat_create_1d: fn(c_int,Handle) -> Handle;
    ncnn_mat_substract_mean_normalize: fn(Handle,*const f32,*const f32);
    ncnn_mat_to_pixels: fn(Handle,*mut u8,c_int,c_int);
}

pub(super) fn check_runtime(path: &Path) -> Result<(), String> {
    unsafe {
        let api = Api::open(path)?;
        #[cfg(windows)]
        let symbol = b"ncnn_net_load_model_w\0";
        #[cfg(not(windows))]
        let symbol = b"ncnn_net_load_model\0";
        api._library
            .get::<unsafe extern "C" fn()>(symbol)
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

struct Net<'a>(&'a Api, Handle);
impl Drop for Net<'_> {
    fn drop(&mut self) {
        if !self.1.is_null() {
            unsafe { (self.0.ncnn_net_destroy)(self.1) }
        }
    }
}
struct Mat<'a>(&'a Api, Handle);
impl Drop for Mat<'_> {
    fn drop(&mut self) {
        if !self.1.is_null() {
            unsafe { (self.0.ncnn_mat_destroy)(self.1) }
        }
    }
}
struct Extractor<'a>(&'a Api, Handle);
impl Drop for Extractor<'_> {
    fn drop(&mut self) {
        if !self.1.is_null() {
            unsafe { (self.0.ncnn_extractor_destroy)(self.1) }
        }
    }
}

fn status(code: c_int, operation: &str) -> Result<(), String> {
    if code == 0 {
        Ok(())
    } else {
        Err(format!("{operation} failed (NCNN {code}); try a smaller tile size"))
    }
}
fn allocate(w: u32, h: u32, channels: usize) -> Result<Vec<u8>, String> {
    let length = (w as usize)
        .checked_mul(h as usize)
        .and_then(|n| n.checked_mul(channels))
        .ok_or("Image dimensions overflow addressable memory")?;
    let mut data = Vec::new();
    data.try_reserve_exact(length)
        .map_err(|e| format!("Not enough memory for {w}×{h}: {e}"))?;
    data.resize(length, 0);
    Ok(data)
}
fn reflect(p: i64, size: u32) -> u32 {
    if size <= 1 {
        return 0;
    }
    let period = 2 * (size as i64 - 1);
    let p = p.rem_euclid(period);
    if p < size as i64 {
        p as u32
    } else {
        (period - p) as u32
    }
}

/// Decode the input with its EXIF orientation applied. Viewers and the WebView
/// preview display oriented pixels, so inference must too or camera photos come
/// back rotated relative to the preview that was submitted.
fn decode_oriented(input: &Path) -> Result<DynamicImage, String> {
    let mut reader = image::ImageReader::open(input)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    reader.no_limits();
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    image.apply_orientation(orientation);
    Ok(image)
}

/// Header-only dimensions as viewers display them: the decoder size after the
/// EXIF orientation, matching the pixels `decode_oriented` produces.
pub(super) fn oriented_dimensions(
    reader: image::ImageReader<impl std::io::BufRead + Seek>,
) -> Result<(u32, u32), String> {
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let (width, height) = decoder.dimensions();
    let swapped = matches!(
        orientation,
        image::metadata::Orientation::Rotate90
            | image::metadata::Orientation::Rotate270
            | image::metadata::Orientation::Rotate90FlipH
            | image::metadata::Orientation::Rotate270FlipH
    );
    Ok(if swapped { (height, width) } else { (width, height) })
}
pub fn event(phase: &str, completed: u64, total: u64) {
    println!(
        "{}",
        serde_json::json!({"phase":phase,"completed":completed,"total":total})
    );
    let _ = std::io::stdout().flush();
}

pub fn run(job: &WorkerJob, exit_after_save: bool) -> Result<(), String> {
    run_backend(job, exit_after_save, true)
}

fn run_backend(job: &WorkerJob, exit_after_save: bool, vulkan: bool) -> Result<(), String> {
    if !(1..=4).contains(&job.native_scale)
        || !(1..=4).contains(&job.output_scale)
        || !(32..=512).contains(&job.tile_size)
    {
        return Err("Invalid model scale or tile size".into());
    }
    let started = Instant::now();
    event("loading", 0, 0);
    let api = unsafe { Api::open(&job.runtime)? };
    // Cache must outlive Net: NCNN retains its pointer while pipelines exist.
    let cache = job
        .pipeline_cache
        .as_deref()
        .and_then(|path| super::cache::PipelineCache::load(&api._library, path));
    let net = Net(&api, unsafe { (api.ncnn_net_create)() });
    // Keep all native owners alive until the isolated worker has published an
    // error too: NCNN destruction can stall on failures as well as on success.
    let result = (|| {
        if net.1.is_null() {
            return Err("Couldn't create the NCNN network".into());
        }
        // The immutable model snapshot has a UTF-8 parameter graph and a local weight path.
        let original_graph = std::fs::read_to_string(&job.param).map_err(|e| e.to_string())?;
        let (pad, alignment) = match (job.architecture, job.native_scale) {
            (Architecture::CuganPro, 2) => (18, 2),
            (Architecture::CuganPro, 3) => (14, 4),
            (Architecture::CuganPro, _) => return Err("Real-CUGAN Pro requires native 2× or 3×".into()),
            (Architecture::General, 4) => (34, 1),
            (Architecture::General, _) => return Err("General x4v3 requires native 4×".into()),
            _ => (16, 1),
        };
        let cugan = job.architecture == Architecture::CuganPro;
        let cropped_graph = if cugan {
            None
        } else {
            super::graph::crop_output(&original_graph, pad * job.native_scale)
        };
        let gpu_crop = cropped_graph.is_some();
        let graph = CString::new(cropped_graph.as_deref().unwrap_or(&original_graph)).map_err(|e| e.to_string())?;
        // Load the binary via the UTF-16 API on Windows to support arbitrary user folder names.
        unsafe {
            let opt = (api.ncnn_net_get_option)(net.1);
            (api.ncnn_option_set_use_vulkan_compute)(opt, vulkan.into());
            (api.ncnn_option_set_num_threads)(opt, 2);
            // The parent validated explicit indices against NCNN's device list.
            // Absent index keeps NCNN's own choice.
            if let Some(index) = job.gpu_index {
                let set_device: libloading::Symbol<unsafe extern "C" fn(Handle, c_int)> = api
                    ._library
                    .get(b"ncnn_net_set_vulkan_device\0")
                    .map_err(|_| "This NCNN runtime cannot set a GPU index".to_string())?;
                set_device(net.1, index);
            }
            if let Some(cache) = &cache {
                cache.attach(opt);
            }
            status(
                (api.ncnn_net_load_param_memory)(net.1, graph.as_ptr()),
                "Loading the model graph",
            )?;
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                let path: Vec<u16> = job.bin.as_os_str().encode_wide().chain(Some(0)).collect();
                let load: libloading::Symbol<unsafe extern "C" fn(Handle, *const u16) -> c_int> = api
                    ._library
                    .get(b"ncnn_net_load_model_w\0")
                    .map_err(|e| e.to_string())?;
                status(load(net.1, path.as_ptr()), "Loading model weights")?;
            }
            #[cfg(not(windows))]
            {
                use std::os::unix::ffi::OsStrExt;
                let path = CString::new(job.bin.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
                let load: libloading::Symbol<unsafe extern "C" fn(Handle, *const c_char) -> c_int> =
                    api._library.get(b"ncnn_net_load_model\0").map_err(|e| e.to_string())?;
                status(load(net.1, path.as_ptr()), "Loading model weights")?;
            }
            if (api.ncnn_net_get_input_count)(net.1) != 1 || (api.ncnn_net_get_output_count)(net.1) != 1 {
                return Err("Only single-input, single-output RGB super-resolution models are supported".into());
            }
        }
        let loaded = started.elapsed();
        let image = decode_oriented(&job.input)?;
        let has_alpha = image.color().has_alpha();
        let (width, height) = (image.width(), image.height());
        let channels = if has_alpha { 4 } else { 3 };
        // Consuming conversions reuse an already RGB/RGBA decoder buffer.
        let input = if has_alpha {
            image.into_rgba8().into_raw()
        } else {
            image.into_rgb8().into_raw()
        };
        let native = job.native_scale;
        let outw = width.checked_mul(native).ok_or("Output width overflow")?;
        let outh = height.checked_mul(native).ok_or("Output height overflow")?;
        let mut output = allocate(outw, outh, channels)?;
        let tile = job.tile_size / alignment * alignment;
        let tile_count = u64::from(width.div_ceil(tile)) * u64::from(height.div_ceil(tile));
        // Exact syncgap=1: four sequential global means, then final inference.
        // Recompute activations to keep memory bounded instead of caching tiles.
        let gap_passes = if cugan && tile_count > 1 { 4 } else { 0 };
        let total = tile_count * (gap_passes + 1);
        let mut completed = 0;
        let decoded = started.elapsed();
        let mut pixels = Vec::new();
        let mut bytes = Vec::new();
        let mut last_progress = Instant::now();
        let mut gaps = Vec::<Mat<'_>>::new();
        for pass in 0..=gap_passes {
            let gap_name = CString::new(format!("gap{pass}")).unwrap();
            let mut sums = Vec::<f64>::new();
            for y in (0..height).step_by(tile as usize) {
                for x in (0..width).step_by(tile as usize) {
                    let tw = tile.min(width - x);
                    let th = tile.min(height - y);
                    let iw = tw.div_ceil(alignment) * alignment + 2 * pad;
                    let ih = th.div_ceil(alignment) * alignment + 2 * pad;
                    resize_buffer(&mut pixels, iw, ih, 3)?;
                    let columns: Vec<_> = (0..iw)
                        .map(|xx| reflect(x as i64 + xx as i64 - pad as i64, width) as usize * channels)
                        .collect();
                    for yy in 0..ih {
                        let sy = reflect(y as i64 + yy as i64 - pad as i64, height) as usize;
                        let row = &input[sy * width as usize * channels..(sy + 1) * width as usize * channels];
                        let target = &mut pixels[(yy * iw * 3) as usize..((yy + 1) * iw * 3) as usize];
                        if channels == 3 && x >= pad && x + iw - pad <= width {
                            let begin = (x - pad) as usize * 3;
                            target.copy_from_slice(&row[begin..begin + iw as usize * 3]);
                        } else {
                            for (pixel, &column) in target.chunks_exact_mut(3).zip(&columns) {
                                pixel.copy_from_slice(&row[column..column + 3]);
                            }
                        }
                    }
                    unsafe {
                        let mat = Mat(
                            &api,
                            (api.ncnn_mat_from_pixels)(
                                pixels.as_ptr(),
                                1,
                                iw as i32,
                                ih as i32,
                                (iw * 3) as i32,
                                ptr::null_mut(),
                            ),
                        );
                        if mat.1.is_null() || (api.ncnn_mat_get_data)(mat.1).is_null() {
                            return Err("NCNN input allocation failed".into());
                        }
                        (api.ncnn_mat_substract_mean_normalize)(mat.1, ptr::null(), [1.0 / 255.0; 3].as_ptr());
                        let ex = Extractor(&api, (api.ncnn_extractor_create)(net.1));
                        if ex.1.is_null() {
                            return Err("NCNN extractor allocation failed".into());
                        }
                        status(
                            (api.ncnn_extractor_input)(ex.1, (api.ncnn_net_get_input_name)(net.1, 0), mat.1),
                            "Setting the model input",
                        )?;
                        for (index, gap) in gaps.iter().enumerate() {
                            let name = CString::new(format!("gap{index}")).unwrap();
                            status(
                                (api.ncnn_extractor_input)(ex.1, name.as_ptr(), gap.1),
                                "Setting synchronized global statistics",
                            )?;
                        }
                        let mut result = Mat(&api, ptr::null_mut());
                        status(
                            (api.ncnn_extractor_extract)(
                                ex.1,
                                if pass < gap_passes {
                                    gap_name.as_ptr()
                                } else {
                                    (api.ncnn_net_get_output_name)(net.1, 0)
                                },
                                &mut result.1,
                            ),
                            "Model inference",
                        )?;
                        if result.1.is_null() || (api.ncnn_mat_get_data)(result.1).is_null() {
                            return Err("The model returned no pixels".into());
                        }
                        if pass < gap_passes {
                            let len = (api.ncnn_mat_get_w)(result.1);
                            if (api.ncnn_mat_get_dims)(result.1) != 1 || !(1..=1024).contains(&len) {
                                return Err("Invalid Real-CUGAN global statistics".into());
                            }
                            let values = std::slice::from_raw_parts(
                                (api.ncnn_mat_get_data)(result.1).cast::<f32>(),
                                len as usize,
                            );
                            if sums.is_empty() {
                                sums.resize(len as usize, 0.0);
                            }
                            if sums.len() != len as usize || values.iter().any(|value| !value.is_finite()) {
                                return Err("Inconsistent Real-CUGAN global statistics".into());
                            }
                            for (sum, value) in sums.iter_mut().zip(values) {
                                *sum += f64::from(*value);
                            }
                        } else {
                            let rw = if cugan {
                                tw.div_ceil(alignment) * alignment * native
                            } else if gpu_crop {
                                tw * native
                            } else {
                                iw * native
                            };
                            let rh = if cugan {
                                th.div_ceil(alignment) * alignment * native
                            } else if gpu_crop {
                                th * native
                            } else {
                                ih * native
                            };
                            if (api.ncnn_mat_get_w)(result.1) != rw as i32
                                || (api.ncnn_mat_get_h)(result.1) != rh as i32
                                || (api.ncnn_mat_get_c)(result.1) != 3
                            {
                                return Err("The model output does not match its declared RGB scale".into());
                            }
                            (api.ncnn_mat_substract_mean_normalize)(result.1, ptr::null(), [255.0; 3].as_ptr());
                            resize_buffer(&mut bytes, rw, rh, 3)?;
                            (api.ncnn_mat_to_pixels)(result.1, bytes.as_mut_ptr(), 1, (rw * 3) as i32);
                            for yy in 0..th * native {
                                let border = if gpu_crop || cugan { 0 } else { pad * native };
                                let start = (((yy + border) * rw + border) * 3) as usize;
                                let source = &bytes[start..start + (tw * native * 3) as usize];
                                let offset =
                                    (((y * native + yy) as usize * outw as usize) + (x * native) as usize) * channels;
                                let target = &mut output[offset..offset + (tw * native) as usize * channels];
                                if channels == 3 {
                                    target.copy_from_slice(source);
                                } else {
                                    for (dst, src) in target.chunks_exact_mut(4).zip(source.chunks_exact(3)) {
                                        dst[..3].copy_from_slice(src);
                                        dst[3] = 255;
                                    }
                                }
                            }
                        }
                    }
                    completed += 1;
                    if completed == 1 || completed == total || last_progress.elapsed() >= Duration::from_millis(100) {
                        event("inferencing", completed, total);
                        last_progress = Instant::now();
                    }
                }
            }
            if pass < gap_passes {
                unsafe {
                    let mean = Mat(&api, (api.ncnn_mat_create_1d)(sums.len() as i32, ptr::null_mut()));
                    if mean.1.is_null() || (api.ncnn_mat_get_data)(mean.1).is_null() {
                        return Err("Global statistics allocation failed".into());
                    }
                    let values =
                        std::slice::from_raw_parts_mut((api.ncnn_mat_get_data)(mean.1).cast::<f32>(), sums.len());
                    for (value, sum) in values.iter_mut().zip(sums) {
                        *value = (sum / tile_count as f64) as f32;
                    }
                    gaps.push(mean);
                }
            }
        }
        event("saving", completed, total);
        let inferred = started.elapsed();
        if has_alpha {
            let alpha = image::ImageBuffer::from_fn(width, height, |x, y| {
                image::Luma([input[(y as usize * width as usize + x as usize) * 4 + 3]])
            });
            let alpha = resize_with_filter(
                &DynamicImage::ImageLuma8(alpha),
                outw,
                outh,
                fast_image_resize::FilterType::CatmullRom,
            )?
            .into_luma8();
            for (p, a) in output.chunks_exact_mut(4).zip(alpha.pixels()) {
                p[3] = a[0];
            }
        }
        drop(input);
        let mut output = if has_alpha {
            DynamicImage::ImageRgba8(ImageBuffer::from_raw(outw, outh, output).ok_or("Invalid output dimensions")?)
        } else {
            DynamicImage::ImageRgb8(ImageBuffer::from_raw(outw, outh, output).ok_or("Invalid output dimensions")?)
        };
        let targetw = width.checked_mul(job.output_scale).ok_or("Output width overflow")?;
        let targeth = height.checked_mul(job.output_scale).ok_or("Output height overflow")?;
        if (targetw, targeth) != (outw, outh) {
            output = resize_output(&output, targetw, targeth)?;
        }
        let resized = started.elapsed();
        write_png(&job.output.with_extension("thumb.png"), &output.thumbnail(384, 384))?;
        write_png(&job.output, &output)?;
        let encoded = started.elapsed();
        if let Some(cache) = &cache {
            cache.save();
        }
        // The complete PNG and thumbnail are available even if GPU teardown stalls.
        println!(
            "{}",
            serde_json::json!({"phase":"saved","completed":completed,"total":total,
            "gpuCrop":gpu_crop,"pipelineCache":cache.is_some(),"pipelineCacheHit":cache.as_ref().is_some_and(|cache| cache.is_hit()),"timingsMs":{
                "load":loaded.as_secs_f64()*1000.0,"decode":(decoded-loaded).as_secs_f64()*1000.0,
                "inference":(inferred-decoded).as_secs_f64()*1000.0,"resize":(resized-inferred).as_secs_f64()*1000.0,
                "encode":(encoded-resized).as_secs_f64()*1000.0,"total":started.elapsed().as_secs_f64()*1000.0
            }})
        );
        let _ = std::io::stdout().flush();
        Ok(())
    })();
    // Both PNGs and the cache are closed before successful exit. Bypass native
    // destructors in this isolated process; the OS reclaims its GPU resources.
    if exit_after_save {
        if let Err(error) = &result {
            println!("{}", serde_json::json!({"error":error}));
            let _ = std::io::stdout().flush();
        }
        exit_worker(if result.is_ok() { 0 } else { 1 });
    }
    result
}

/// The isolated worker owns no pending image writes when this is called.
/// ExitProcess/CRT exit still runs DLL detach handlers on Windows, where NCNN's
/// global Vulkan teardown can deadlock. Terminate only this completed process.
pub(super) fn exit_worker(code: i32) -> ! {
    #[cfg(windows)]
    unsafe {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetCurrentProcess() -> *mut c_void;
            fn TerminateProcess(process: *mut c_void, code: u32) -> c_int;
        }
        TerminateProcess(GetCurrentProcess(), code as u32);
    }
    #[cfg(unix)]
    unsafe {
        extern "C" {
            fn _exit(code: c_int) -> !;
        }
        _exit(code);
    }
    #[cfg(not(unix))]
    std::process::abort()
}

fn resize_buffer(buffer: &mut Vec<u8>, w: u32, h: u32, channels: usize) -> Result<(), String> {
    let length = (w as usize)
        .checked_mul(h as usize)
        .and_then(|n| n.checked_mul(channels))
        .ok_or("Image dimensions overflow addressable memory")?;
    if length > buffer.len() {
        buffer
            .try_reserve_exact(length - buffer.len())
            .map_err(|e| format!("Not enough memory for tile: {e}"))?;
    }
    buffer.resize(length, 0);
    Ok(())
}

fn resize_output(input: &DynamicImage, width: u32, height: u32) -> Result<DynamicImage, String> {
    resize_with_filter(input, width, height, fast_image_resize::FilterType::Lanczos3)
}

fn resize_with_filter(
    input: &DynamicImage,
    width: u32,
    height: u32,
    filter: fast_image_resize::FilterType,
) -> Result<DynamicImage, String> {
    let mut output = if input.color() == image::ColorType::L8 {
        DynamicImage::ImageLuma8(
            ImageBuffer::from_raw(width, height, allocate(width, height, 1)?).ok_or("Invalid output dimensions")?,
        )
    } else if input.color().has_alpha() {
        DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(width, height, allocate(width, height, 4)?).ok_or("Invalid output dimensions")?,
        )
    } else {
        DynamicImage::ImageRgb8(
            ImageBuffer::from_raw(width, height, allocate(width, height, 3)?).ok_or("Invalid output dimensions")?,
        )
    };
    // Preserve the existing independent-channel Lanczos3 behavior. SIMD dispatch
    // is selected at runtime, so the binary also works without AVX2/NEON.
    let options = fast_image_resize::ResizeOptions::new()
        .resize_alg(fast_image_resize::ResizeAlg::Convolution(filter))
        .use_alpha(false);
    fast_image_resize::Resizer::new()
        .resize(input, &mut output, &options)
        .map_err(|e| e.to_string())?;
    Ok(output)
}

fn write_png(path: &Path, image: &DynamicImage) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);
    encode_png(&mut writer, image)
}

fn encode_png(writer: &mut (impl Write + Seek), image: &DynamicImage) -> Result<(), String> {
    image
        .write_to(&mut *writer, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    // BufWriter's Drop ignores flush errors. Report them before emitting saved.
    writer.flush().map_err(|e| e.to_string())
}
