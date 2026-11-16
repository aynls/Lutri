use crate::storage::Store;
use multer::{Constraints, Multipart, SizeLimit};
use reqwest::header::CONTENT_TYPE;
use serde_json::Value;
use std::{collections::HashMap, fs::OpenOptions, io::Write, path::PathBuf};
use uuid::Uuid;

#[derive(Default)]
struct StagedFiles(Vec<PathBuf>);

impl StagedFiles {
    fn write(&mut self, store: &Store, bytes: &[u8]) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let path = store.root.join("staging").join(&id);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| format!("Could not stage Recraft image: {error}"))?;
        self.0.push(path);
        file.write_all(bytes)
            .map_err(|error| format!("Could not stage Recraft image: {error}"))?;
        Ok(format!("staged:{id}"))
    }
}

impl Drop for StagedFiles {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn parse_error(error: multer::Error) -> String {
    format!("Invalid Recraft multipart response: {error}")
}

pub(super) async fn multipart_result(store: &Store, response: reqwest::Response) -> Result<String, String> {
    let content_type = response.headers()[CONTENT_TYPE]
        .to_str()
        .map_err(|_| "Invalid Recraft multipart Content-Type")?;
    let boundary = multer::parse_boundary(content_type).map_err(parse_error)?;
    let limits = SizeLimit::new()
        .whole_stream(128 * 1024 * 1024)
        .for_field("response", 1024 * 1024);
    let mut multipart =
        Multipart::with_constraints(response.bytes_stream(), boundary, Constraints::new().size_limit(limits));
    let mut manifest: Option<Value> = None;
    let mut images = HashMap::new();
    while let Some(field) = multipart.next_field().await.map_err(parse_error)? {
        if field.name() == Some("response") {
            if manifest.is_some() {
                return Err("Duplicate Recraft multipart metadata".into());
            }
            let bytes = field.bytes().await.map_err(parse_error)?;
            manifest = Some(
                serde_json::from_slice(&bytes)
                    .map_err(|error| format!("Invalid Recraft multipart metadata: {error}"))?,
            );
            continue;
        }
        let image_id = field
            .headers()
            .get("content-id")
            .and_then(|value| value.to_str().ok())
            .map(|value| value.trim().trim_matches(['<', '>']))
            .or_else(|| field.name())
            .filter(|value| !value.is_empty())
            .ok_or("Missing Recraft multipart image ID")?
            .to_owned();
        let media_type = field
            .content_type()
            .map(|value| value.essence_str())
            .filter(|value| matches!(*value, "image/png" | "image/webp" | "image/svg+xml"))
            .ok_or("Invalid Recraft multipart image Content-Type")?
            .to_owned();
        let bytes = field.bytes().await.map_err(parse_error)?;
        if bytes.is_empty() {
            return Err("Empty Recraft multipart image".into());
        }
        if images.insert(image_id, (bytes, media_type)).is_some() {
            return Err("Duplicate Recraft multipart image ID".into());
        }
    }

    let mut manifest = manifest.ok_or("Missing Recraft multipart metadata")?;
    let entries = manifest
        .get_mut("data")
        .and_then(Value::as_array_mut)
        .filter(|entries| !entries.is_empty())
        .ok_or("Missing Recraft multipart image list")?;
    let mut staged = StagedFiles::default();
    for entry in entries {
        let image_id = entry
            .get("image_id")
            .and_then(Value::as_str)
            .ok_or("Missing image ID in Recraft multipart metadata")?;
        let (bytes, media_type) = images
            .remove(image_id)
            .ok_or("Missing or repeated image in Recraft multipart metadata")?;
        entry["url"] = Value::String(staged.write(store, &bytes)?);
        entry["content_type"] = Value::String(media_type);
    }
    if !images.is_empty() {
        return Err("Unmatched Recraft multipart images".into());
    }
    // The task result pipeline now owns the staged files.
    staged.0.clear();
    Ok(manifest.to_string())
}
