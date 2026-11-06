use crate::storage::Store;
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GenericImageView, ImageFormat};
use serde_json::{json, Value};
use std::path::Path;

pub fn decode_data_url(data: &str) -> Result<Vec<u8>, String> {
    let (header, encoded) = data.split_once(',').ok_or("Invalid image data URL")?;
    if !header.starts_with("data:") || !header.ends_with(";base64") {
        return Err("Expected a Base64 data URL".into());
    }
    STANDARD.decode(encoded).map_err(|e| e.to_string())
}

pub fn save_asset(store: &Store, bytes: &[u8], source: &str) -> Result<Value, String> {
    save_asset_with_id(store, bytes, source, uuid::Uuid::new_v4().to_string())
}

pub(crate) fn save_asset_with_id(store: &Store, bytes: &[u8], source: &str, id: String) -> Result<Value, String> {
    save_image_with_id(store, bytes, source, id, "gallery")
}

fn save_image_with_id(
    store: &Store,
    bytes: &[u8],
    source: &str,
    id: String,
    collection: &str,
) -> Result<Value, String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    if let Ok(existing) = image_entry(store, &id) {
        return Ok(existing);
    }
    let (decoded, extension, media_type) = match image::guess_format(bytes) {
        Ok(format) => (
            image::load_from_memory_with_format(bytes, format).map_err(|e| e.to_string())?,
            format.extensions_str()[0],
            format.to_mime_type(),
        ),
        Err(_) => {
            let mut options = resvg::usvg::Options::default();
            options.fontdb_mut().load_system_fonts();
            let tree = resvg::usvg::Tree::from_data(bytes, &options).map_err(|e| e.to_string())?;
            let size = tree.size().to_int_size();
            let mut pixmap =
                resvg::tiny_skia::Pixmap::new(size.width(), size.height()).ok_or("Invalid SVG dimensions")?;
            resvg::render(&tree, resvg::tiny_skia::Transform::default(), &mut pixmap.as_mut());
            let png = pixmap.encode_png().map_err(|e| e.to_string())?;
            (
                image::load_from_memory_with_format(&png, ImageFormat::Png).map_err(|e| e.to_string())?,
                "svg",
                "image/svg+xml",
            )
        }
    };
    let (width, height) = decoded.dimensions();
    let root = store.library.read().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Library folder is unavailable".into());
    }
    let path = root.join("assets").join(format!("{id}.{extension}"));
    let thumbnail = root.join("thumbnails").join(format!("{id}.png"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    decoded
        .thumbnail(480, 480)
        .save_with_format(&thumbnail, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let entry = json!({
        "asset": { "id": id, "mediaType": media_type, "width": width, "height": height },
        "path": path, "thumbnailPath": thumbnail, "source": source,
        "addedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_millis() as u64,
        "favorite": false, "boardIds": [], "tags": [], "bytes":bytes.len(), "availability":"available",
        "provenance":{"kind":if source=="imported"{"import"}else{"generation"}}
    });
    store
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute(
            "INSERT INTO records(collection,id,body) VALUES(?1,?2,?3)",
            rusqlite::params![collection, id, entry.to_string()],
        )
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

pub fn entry(store: &Store, id: &str) -> Result<Value, String> {
    read_entry(store, id, "collection='gallery'")
}

fn image_entry(store: &Store, id: &str) -> Result<Value, String> {
    read_entry(store, id, "collection IN ('gallery','masks')")
}

fn read_entry(store: &Store, id: &str, collection_filter: &str) -> Result<Value, String> {
    let body: String = store
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .query_row(
            &format!("SELECT body FROM records WHERE {collection_filter} AND id=?1"),
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mask_save(store: tauri::State<Store>, data_url: String) -> Result<Value, String> {
    save_image_with_id(
        &store,
        &decode_data_url(&data_url)?,
        "imported",
        uuid::Uuid::new_v4().to_string(),
        "masks",
    )
}

#[tauri::command]
pub async fn asset_import(
    store: tauri::State<'_, Store>,
    path: Option<String>,
    data_url: Option<String>,
    url: Option<String>,
) -> Result<Value, String> {
    let bytes = match (path, data_url, url) {
        (Some(path), _, _) => std::fs::read(path).map_err(|e| e.to_string())?,
        (_, Some(data), _) => decode_data_url(&data)?,
        (_, _, Some(url)) => reqwest::Client::new()
            .get(url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec(),
        _ => return Err("Image source required".into()),
    };
    save_asset(&store, &bytes, "imported")
}

#[tauri::command]
pub async fn asset_download(store: tauri::State<'_, Store>, url: String, result_id: String) -> Result<Value, String> {
    let result_id = uuid::Uuid::parse_str(&result_id)
        .map_err(|e| e.to_string())?
        .to_string();
    if let Ok(existing) = entry(&store, &result_id) {
        return Ok(existing);
    }
    let bytes = if let Some(id) = url.strip_prefix("staged:") {
        let id = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        std::fs::read(store.root.join("staging").join(id.to_string())).map_err(|e| e.to_string())?
    } else if url.starts_with("data:") {
        decode_data_url(&url)?
    } else {
        reqwest::Client::new()
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec()
    };
    let result = save_asset_with_id(&store, &bytes, "generated", result_id)?;
    if let Some(id) = url.strip_prefix("staged:") {
        let id = uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(store.root.join("staging").join(id.to_string()));
    }
    Ok(result)
}

#[tauri::command]
pub fn result_stage(store: tauri::State<Store>, data_url: String) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    std::fs::write(store.root.join("staging").join(&id), decode_data_url(&data_url)?).map_err(|e| e.to_string())?;
    Ok(format!("staged:{id}"))
}

#[tauri::command]
pub fn asset_data(store: tauri::State<Store>, id: String) -> Result<String, String> {
    let _guard = store.library.read().map_err(|e| e.to_string())?;
    let value = image_entry(&store, &id)?;
    let path = value["path"].as_str().ok_or("Missing asset path")?;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let media = value["asset"]["mediaType"].as_str().ok_or("Missing media type")?;
    Ok(format!("data:{media};base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn asset_exists(store: tauri::State<Store>, id: String) -> bool {
    let Ok(_guard) = store.library.read() else {
        return false;
    };
    image_entry(&store, &id)
        .ok()
        .and_then(|v| v["path"].as_str().map(|p| Path::new(p).is_file()))
        .unwrap_or(false)
}

#[tauri::command]
pub fn asset_export(store: tauri::State<Store>, id: String, destination: String) -> Result<(), String> {
    let _guard = store.library.read().map_err(|e| e.to_string())?;
    let value = entry(&store, &id)?;
    std::fs::copy(value["path"].as_str().ok_or("Missing asset path")?, destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn asset_delete(store: tauri::State<Store>, id: String) -> Result<(), String> {
    delete_asset(&store, &id)
}

pub fn delete_asset(store: &Store, id: &str) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let root = store.library.read().map_err(|e| e.to_string())?;
    delete_asset_locked(store, id, &root)
}

pub fn delete_asset_locked(store: &Store, id: &str, root: &Path) -> Result<(), String> {
    let value = entry(store, id)?;
    for key in ["path", "thumbnailPath"] {
        if let Some(path) = value[key].as_str() {
            let path = Path::new(path);
            if path.is_file() && path.starts_with(root) {
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
    }
    store
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute("DELETE FROM records WHERE collection='gallery' AND id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn assets_export(
    store: tauri::State<'_, Store>,
    ids: Vec<String>,
    directory: String,
) -> Result<Value, String> {
    let sources = ids
        .into_iter()
        .map(|id| (id.clone(), entry(&store, &id)))
        .collect::<Vec<_>>();
    tauri::async_runtime::spawn_blocking(move || {
        let directory = Path::new(&directory);
        if !directory.is_dir() {
            return Err("Output folder does not exist".to_string());
        }
        let mut saved = 0;
        let mut errors = Vec::new();
        for (id, source) in sources {
            let result = (|| -> Result<(), String> {
                let source = source?;
                let path = Path::new(source["path"].as_str().ok_or("Missing asset path")?);
                let stem = path.file_stem().and_then(|v| v.to_str()).ok_or("Invalid filename")?;
                let extension = path.extension().and_then(|v| v.to_str()).unwrap_or("png");
                for suffix in 0.. {
                    let name = if suffix == 0 {
                        format!("{stem}.{extension}")
                    } else {
                        format!("{stem} ({suffix}).{extension}")
                    };
                    let destination = directory.join(name);
                    let mut output = match std::fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&destination)
                    {
                        Ok(file) => file,
                        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                        Err(error) => return Err(error.to_string()),
                    };
                    let copied = std::fs::File::open(path).and_then(|mut input| std::io::copy(&mut input, &mut output));
                    if let Err(error) = copied {
                        drop(output);
                        let _ = std::fs::remove_file(destination);
                        return Err(error.to_string());
                    }
                    return Ok(());
                }
                unreachable!()
            })();
            match result {
                Ok(()) => saved += 1,
                Err(error) => errors.push(format!("{id}: {error}")),
            }
        }
        Ok(serde_json::json!({ "saved": saved, "errors": errors }))
    })
    .await
    .map_err(|error| error.to_string())?
}
