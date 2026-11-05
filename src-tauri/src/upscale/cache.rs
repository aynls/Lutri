//! Optional cross-process shader/pipeline caching through NCNN's published C ABI.
use libloading::Library;
use std::{
    ffi::{c_int, c_void},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    marker::PhantomData,
    path::{Path, PathBuf},
};

type Handle = *mut c_void;
const MAX_CACHE_BYTES: usize = 64 * 1024 * 1024;

pub struct PipelineCache<'a> {
    handle: Handle,
    path: PathBuf,
    hit: bool,
    destroy: unsafe extern "C" fn(Handle),
    set: unsafe extern "C" fn(Handle, Handle),
    save_memory: unsafe extern "C" fn(Handle, *mut u8, *mut usize) -> c_int,
    _library: PhantomData<&'a Library>,
}

impl<'a> PipelineCache<'a> {
    /// Only cache the unambiguous single-GPU case. The C ABI cannot query the
    /// default GPU; probing index 1 avoids changing NCNN's automatic selection
    /// on systems with multiple devices. Old runtimes simply omit this feature.
    pub fn load(library: &'a Library, path: &Path) -> Option<Self> {
        unsafe {
            let create = *library
                .get::<unsafe extern "C" fn(c_int) -> Handle>(b"ncnn_pipelinecache_create\0")
                .ok()?;
            let destroy = *library
                .get::<unsafe extern "C" fn(Handle)>(b"ncnn_pipelinecache_destroy\0")
                .ok()?;
            let clear = *library
                .get::<unsafe extern "C" fn(Handle)>(b"ncnn_pipelinecache_clear\0")
                .ok()?;
            let load_memory = *library
                .get::<unsafe extern "C" fn(Handle, *const u8, usize) -> c_int>(b"ncnn_pipelinecache_load_memory\0")
                .ok()?;
            let save_memory = *library
                .get::<unsafe extern "C" fn(Handle, *mut u8, *mut usize) -> c_int>(b"ncnn_pipelinecache_save_memory\0")
                .ok()?;
            let set = *library
                .get::<unsafe extern "C" fn(Handle, Handle)>(b"ncnn_option_set_pipeline_cache\0")
                .ok()?;
            let second_device = create(1);
            if !second_device.is_null() {
                destroy(second_device);
                return None;
            }
            let handle = create(0);
            if handle.is_null() {
                return None;
            }
            let mut cache = Self {
                handle,
                path: path.to_owned(),
                hit: false,
                destroy,
                set,
                save_memory,
                _library: PhantomData,
            };
            if let Ok(file) = File::open(path) {
                let mut bytes = Vec::new();
                if file.take(MAX_CACHE_BYTES as u64 + 1).read_to_end(&mut bytes).is_ok()
                    && !bytes.is_empty()
                    && bytes.len() <= MAX_CACHE_BYTES
                {
                    // NCNN validates the runtime, GPU, driver, UUID and lengths.
                    // Any incompatible or partial file is a cache miss.
                    if load_memory(handle, bytes.as_ptr(), bytes.len()) == 0 {
                        cache.hit = true;
                    } else {
                        clear(handle);
                    }
                }
            }
            Some(cache)
        }
    }

    pub fn is_hit(&self) -> bool {
        self.hit
    }

    /// The network and its option must be valid, and must be destroyed before
    /// this cache. Declare the cache before constructing the network.
    pub unsafe fn attach(&self, option: Handle) {
        (self.set)(option, self.handle);
    }

    /// Caches are expendable: an I/O or native cache error never fails a job.
    pub fn save(&self) {
        let mut size = 0;
        unsafe { (self.save_memory)(self.handle, std::ptr::null_mut(), &mut size) };
        if size == 0 || size > MAX_CACHE_BYTES {
            return;
        }
        let mut bytes = Vec::new();
        if bytes.try_reserve_exact(size).is_err() {
            return;
        }
        bytes.resize(size, 0);
        if unsafe { (self.save_memory)(self.handle, bytes.as_mut_ptr(), &mut size) } != 0 || size > bytes.len() {
            return;
        }
        bytes.truncate(size);
        let Some(directory) = self.path.parent() else {
            return;
        };
        if fs::create_dir_all(directory).is_err() {
            return;
        }
        let temporary = self.path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let written = (|| -> std::io::Result<()> {
            let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)?;
            file.write_all(&bytes)?;
            drop(file);
            // Unique staging names let concurrent workers replace a complete
            // cache atomically. Unlike image results, caches need no fsync.
            fs::rename(&temporary, &self.path)
        })();
        if written.is_err() {
            let _ = fs::remove_file(temporary);
        }
    }
}

impl Drop for PipelineCache<'_> {
    fn drop(&mut self) {
        unsafe { (self.destroy)(self.handle) };
    }
}
