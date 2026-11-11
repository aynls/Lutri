use crate::{assets, psd, storage::Store};
use image::{imageops, DynamicImage, ImageFormat, Rgba, Rgba32FImage, RgbaImage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    io::Cursor,
    path::{Path, PathBuf},
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerSource {
    url: String,
    z_index: u32,
    bounds: Option<[f64; 4]>,
    normalized_bounds: Option<[f64; 4]>,
    name: Option<String>,
    description: Option<String>,
}

#[tauri::command]
pub fn layer_directory_available(directory: String) -> bool {
    let path = Path::new(&directory);
    path.is_absolute() && path.is_dir()
}

fn write_new(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = std::fs::File::create_new(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let outcome = (|| {
        write_new(&temporary, bytes)?;
        std::fs::rename(&temporary, path)
    })();
    if outcome.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    outcome.map_err(|error| error.to_string())
}

fn export_directory(directory: &str, id: &str, staging: &Path) -> Result<PathBuf, String> {
    if !layer_directory_available(directory.to_owned()) {
        return Err("layer_directory_unavailable".into());
    }
    let target = Path::new(directory).join(format!("Lutri-{id}"));
    let manifest = staging.join("delivery.json");
    match std::fs::create_dir(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if let Ok(bytes) = std::fs::read(&manifest) {
                let saved: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                if saved["id"] == id && saved["directory"] == directory && target.is_dir() {
                    if let Some(token) = saved["temporaryToken"].as_str() {
                        let token = uuid::Uuid::parse_str(token).map_err(|e| e.to_string())?;
                        for stem in ["composite", "layers"] {
                            match std::fs::remove_file(target.join(format!("{stem}.{token}.tmp"))) {
                                Ok(()) => {}
                                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                                Err(error) => return Err(error.to_string()),
                            }
                        }
                    }
                    return Ok(target);
                }
            }
            if !target.is_dir() || std::fs::read_dir(&target).map_err(|e| e.to_string())?.next().is_some() {
                return Err("layer_output_conflict".into());
            }
        }
        Err(error) => return Err(error.to_string()),
    }
    write_atomic(
        &manifest,
        &serde_json::to_vec_pretty(&json!({"id":id,"directory":directory,"complete":false}))
            .map_err(|e| e.to_string())?,
    )?;
    Ok(target)
}

async fn source_bytes(store: &Store, client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    if let Some(id) = url.strip_prefix("staged:") {
        let id = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        return std::fs::read(store.root.join("staging").join(id.to_string())).map_err(|e| e.to_string());
    }
    if url.starts_with("data:") {
        return assets::decode_data_url(url);
    }
    client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| e.to_string())
}

fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buffer.into_inner())
}

fn bounds(layer: &LayerSource, width: u32, height: u32) -> Result<[u32; 4], String> {
    let values = layer
        .bounds
        .or_else(|| {
            layer.normalized_bounds.map(|[l, t, r, b]| {
                [
                    l * width as f64 / 1000.0,
                    t * height as f64 / 1000.0,
                    r * width as f64 / 1000.0,
                    b * height as f64 / 1000.0,
                ]
            })
        })
        .ok_or("invalid_layer_bounds")?;
    let [l, t, r, b] = values;
    if values.iter().any(|v| !v.is_finite())
        || l < 0.0
        || t < 0.0
        || r <= l
        || b <= t
        || r > width as f64
        || b > height as f64
    {
        return Err("invalid_layer_bounds".into());
    }
    let result = values.map(|v| v.round() as u32);
    if result[2] <= result[0] || result[3] <= result[1] {
        return Err("invalid_layer_bounds".into());
    }
    Ok(result)
}

// Resample premultiplied colors to retain clean edges around transparent layers.
fn resize_layer(image: RgbaImage, width: u32, height: u32) -> RgbaImage {
    if image.dimensions() == (width, height) {
        return image;
    }
    let premultiplied = Rgba32FImage::from_fn(image.width(), image.height(), |x, y| {
        let [r, g, b, a] = image.get_pixel(x, y).0.map(|v| v as f32 / 255.0);
        Rgba([r * a, g * a, b * a, a])
    });
    let resized = imageops::resize(&premultiplied, width, height, imageops::FilterType::Triangle);
    RgbaImage::from_fn(width, height, |x, y| {
        let [r, g, b, a] = resized.get_pixel(x, y).0;
        if a <= 0.0 {
            return Rgba([0, 0, 0, 0]);
        }
        Rgba([
            (r / a * 255.0).round() as u8,
            (g / a * 255.0).round() as u8,
            (b / a * 255.0).round() as u8,
            (a * 255.0).round() as u8,
        ])
    })
}

fn compose_and_save(
    store: &Store,
    id: String,
    directory: String,
    staging: PathBuf,
    sources: Vec<LayerSource>,
) -> Result<Value, String> {
    let mut canvas = image::open(staging.join("0.png"))
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (width, height) = canvas.dimensions();
    if width > 30000 || height > 30000 || width as u64 * height as u64 > 36_000_000 {
        return Err("invalid_layer_result".into());
    }
    let mut layers = vec![psd::Layer {
        path: staging.join("0.png"),
        bounds: [0, 0, width, height],
        name: sources[0]
            .name
            .clone()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "Base".into()),
    }];
    for layer in sources.iter().skip(1) {
        let image = image::open(staging.join(format!("{}.png", layer.z_index)))
            .map_err(|e| e.to_string())?
            .to_rgba8();
        let [l, t, r, b] = bounds(layer, width, height)?;
        let resized = resize_layer(image, r - l, b - t);
        imageops::overlay(&mut canvas, &resized, l as i64, t as i64);
        let path = staging.join(format!("{}-tile.png", layer.z_index));
        write_atomic(&path, &encode_png(&DynamicImage::ImageRgba8(resized))?)?;
        layers.push(psd::Layer {
            path,
            bounds: [l, t, r, b],
            name: layer
                .name
                .clone()
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| format!("Layer {}", layer.z_index)),
        });
    }
    let composite = DynamicImage::ImageRgba8(canvas);
    let png = encode_png(&composite)?;
    let asset = assets::save_generated_with_id(store, &png, id.clone())?;
    let mut delivery = json!({"status":"failed"});
    let export = (|| -> Result<(), String> {
        let target = export_directory(&directory, &id, &staging)?;
        let composite_path = target.join("composite.png");
        let psd_path = target.join("layers.psd");
        let token = uuid::Uuid::new_v4();
        let png_temp = target.join(format!("composite.{token}.tmp"));
        let psd_temp = target.join(format!("layers.{token}.tmp"));
        write_atomic(
            &staging.join("delivery.json"),
            &serde_json::to_vec(&json!({
                "id":id,"directory":directory,"complete":false,"temporaryToken":token.to_string(),
            }))
            .map_err(|e| e.to_string())?,
        )?;
        let outcome = (|| {
            write_new(&png_temp, &png).map_err(|e| e.to_string())?;
            psd::write(&psd_temp, &layers, composite.as_rgba8().ok_or("invalid_layer_result")?)?;
            std::fs::rename(&png_temp, &composite_path).map_err(|e| e.to_string())?;
            delivery["compositePath"] = json!(composite_path);
            std::fs::rename(&psd_temp, &psd_path).map_err(|e| e.to_string())?;
            delivery["psdPath"] = json!(psd_path);
            write_atomic(
                &staging.join("delivery.json"),
                &serde_json::to_vec(&json!({"id":id,"directory":directory,"complete":true}))
                    .map_err(|e| e.to_string())?,
            )?;
            Ok(())
        })();
        if outcome.is_err() {
            let _ = std::fs::remove_file(png_temp);
            let _ = std::fs::remove_file(psd_temp);
        }
        outcome
    })();
    match export {
        Ok(()) => delivery["status"] = json!("completed"),
        Err(error) => delivery["error"] = json!(error),
    }
    Ok(json!({"asset":asset,"delivery":delivery}))
}

#[tauri::command]
pub async fn layer_result_save(
    app: tauri::AppHandle,
    directory: String,
    result_id: String,
    mut sources: Vec<LayerSource>,
    max_layers: usize,
) -> Result<Value, String> {
    use tauri::Manager;
    let id = uuid::Uuid::parse_str(&result_id)
        .map_err(|e| e.to_string())?
        .to_string();
    let store = app.state::<Store>();
    sources.sort_by_key(|layer| layer.z_index);
    let mut indices = HashSet::new();
    if !(1..=99).contains(&max_layers)
        || sources.len() < 2
        || sources.len() > max_layers + 1
        || sources[0].z_index != 0
        || sources.iter().any(|s| s.url.is_empty() || !indices.insert(s.z_index))
    {
        return Err("invalid_layer_result".into());
    }
    let staging = store.root.join("staging").join("layers").join(&id);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    write_atomic(
        &staging.join("sources.json"),
        &serde_json::to_vec(&sources).map_err(|e| e.to_string())?,
    )?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    for source in &sources {
        let path = staging.join(format!("{}.png", source.z_index));
        if path.is_file() {
            continue;
        }
        let bytes = source_bytes(&store, &client, &source.url).await?;
        tauri::async_runtime::spawn_blocking(move || {
            let decoded = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
            let png = if image::guess_format(&bytes).ok() == Some(ImageFormat::Png) {
                bytes
            } else {
                encode_png(&decoded)?
            };
            write_atomic(&path, &png)
        })
        .await
        .map_err(|e| e.to_string())??;
    }
    let worker_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        compose_and_save(&worker_app.state::<Store>(), id, directory, staging, sources)
    })
    .await
    .map_err(|e| e.to_string())?
}
