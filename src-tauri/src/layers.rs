use crate::{assets, storage::Store};
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

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let outcome = (|| {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&temporary, path)
    })();
    if outcome.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    outcome.map_err(|error| error.to_string())
}

fn export_directory(directory: &str, id: &str) -> Result<PathBuf, String> {
    if !layer_directory_available(directory.to_owned()) {
        return Err("layer_directory_unavailable".into());
    }
    let target = Path::new(directory).join(format!("Lutri-{id}"));
    let manifest = target.join("layers.json");
    match std::fs::create_dir(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if let Ok(bytes) = std::fs::read(&manifest) {
                let saved: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                if saved["id"] == id {
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
        &serde_json::to_vec_pretty(&json!({"id":id,"complete":false})).map_err(|e| e.to_string())?,
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

fn compose_and_save(store: &Store, id: String, target: PathBuf, sources: Vec<LayerSource>) -> Result<Value, String> {
    let mut canvas = image::open(target.join("00-base.png"))
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (width, height) = canvas.dimensions();
    let mut manifest = vec![json!({"file":"00-base.png","z_index":0,"width":width,"height":height})];
    for layer in sources.iter().skip(1) {
        let file = format!("{:02}-layer.png", layer.z_index);
        let image = image::open(target.join(&file)).map_err(|e| e.to_string())?.to_rgba8();
        let (source_width, source_height) = image.dimensions();
        let [l, t, r, b] = bounds(layer, width, height)?;
        let resized = resize_layer(image, r - l, b - t);
        imageops::overlay(&mut canvas, &resized, l as i64, t as i64);
        manifest.push(json!({"file":file,"z_index":layer.z_index,"name":layer.name,"description":layer.description,
            "width":source_width,"height":source_height,"bounding_box":{"absolute":[l,t,r,b],"normalized":layer.normalized_bounds}}));
    }
    let png = encode_png(&DynamicImage::ImageRgba8(canvas))?;
    write_atomic(
        &target.join("layers.json"),
        &serde_json::to_vec_pretty(&json!({
            "id":id,"complete":true,"canvas":{"width":width,"height":height},"layers":manifest,
        }))
        .map_err(|e| e.to_string())?,
    )?;
    assets::save_asset_with_id(store, &png, "generated", id)
}

#[tauri::command]
pub async fn layer_result_save(
    app: tauri::AppHandle,
    directory: String,
    result_id: String,
    mut sources: Vec<LayerSource>,
) -> Result<Value, String> {
    use tauri::Manager;
    let id = uuid::Uuid::parse_str(&result_id)
        .map_err(|e| e.to_string())?
        .to_string();
    let store = app.state::<Store>();
    if let Ok(existing) = assets::entry(&store, &id) {
        return Ok(existing);
    }
    sources.sort_by_key(|layer| layer.z_index);
    let mut indices = HashSet::new();
    if sources.is_empty()
        || sources.len() > 17
        || sources[0].z_index != 0
        || sources.iter().any(|s| s.url.is_empty() || !indices.insert(s.z_index))
    {
        return Err("invalid_layer_result".into());
    }
    let target = export_directory(&directory, &id)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    for source in &sources {
        let filename = if source.z_index == 0 {
            "00-base.png".to_owned()
        } else {
            format!("{:02}-layer.png", source.z_index)
        };
        let path = target.join(filename);
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
    tauri::async_runtime::spawn_blocking(move || compose_and_save(&worker_app.state::<Store>(), id, target, sources))
        .await
        .map_err(|e| e.to_string())?
}
