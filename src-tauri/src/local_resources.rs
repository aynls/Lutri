use crate::{
    assets,
    cleanup_policy::{self, CleanupPolicy},
    storage::Store,
    upscale::Scheduler,
};
use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use tauri::Manager;

const IMAGE_ROWS: &str = "SELECT collection,id,body FROM records WHERE collection IN ('gallery','outputs') AND COALESCE(json_extract(body,'$.staged'),0)<>1";

pub struct SafePaths {
    pub image: PathBuf,
    pub thumbnail: PathBuf,
}

pub fn checked_file(
    root: &Path,
    folder: &str,
    value: &Value,
    key: &str,
    id: &str,
) -> Result<(PathBuf, Option<u64>), &'static str> {
    let path = PathBuf::from(value[key].as_str().ok_or("invalid")?);
    let directory = root.join(folder);
    if path.parent() != Some(directory.as_path()) {
        return Err("outsideManaged");
    }
    let name = path.file_name().and_then(|name| name.to_str()).ok_or("invalid")?;
    if folder == "thumbnails" {
        if name != format!("{id}.png") {
            return Err("outsideManaged");
        }
    } else if path.file_stem().and_then(|stem| stem.to_str()) != Some(id)
        || !path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric()))
    {
        return Err("outsideManaged");
    }
    let canonical_root = root.canonicalize().map_err(|_| "invalid")?;
    let dir_meta = std::fs::symlink_metadata(&directory).map_err(|_| "invalid")?;
    if dir_meta.file_type().is_symlink() || !dir_meta.is_dir() {
        return Err("outsideManaged");
    }
    let canonical_dir = directory.canonicalize().map_err(|_| "invalid")?;
    if canonical_dir != canonical_root.join(folder) {
        return Err("outsideManaged");
    }
    match std::fs::symlink_metadata(&path) {
        Ok(meta) => {
            if meta.file_type().is_symlink() || !meta.is_file() {
                return Err("outsideManaged");
            }
            if path.canonicalize().map_err(|_| "invalid")? != canonical_dir.join(name) {
                return Err("outsideManaged");
            }
            Ok((path, Some(meta.len())))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((path, None)),
        Err(_) => Err("invalid"),
    }
}

pub fn safe_paths(root: &Path, id: &str, value: &Value) -> Result<SafePaths, &'static str> {
    if uuid::Uuid::parse_str(id).ok().map(|id| id.to_string()).as_deref() != Some(id)
        || value["asset"]["id"].as_str() != Some(id)
    {
        return Err("invalid");
    }
    let (image, _) = checked_file(root, "assets", value, "path", id)?;
    let (thumbnail, _) = checked_file(root, "thumbnails", value, "thumbnailPath", id)?;
    Ok(SafePaths { image, thumbnail })
}

fn collect(value: &Value, ids: &mut HashSet<String>) {
    match value {
        Value::Array(values) => values.iter().for_each(|value| collect(value, ids)),
        Value::Object(values) => {
            for (key, value) in values {
                if (key == "assetId" || key == "$asset") && value.as_str().is_some() {
                    ids.insert(value.as_str().unwrap().to_string());
                }
                collect(value, ids);
            }
        }
        _ => {}
    }
}

pub fn in_use_ids(app: &tauri::AppHandle, keep_ids: &[String]) -> Result<HashSet<String>, String> {
    let store = app.state::<Store>();
    let mut ids: HashSet<String> = keep_ids.iter().cloned().collect();
    {
        let db = store.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT collection,body FROM records WHERE collection IN ('draft','creation','tasks','batches')")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (collection, body) = row.map_err(|e| e.to_string())?;
            let value: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
            if !value.is_object() {
                return Err("Invalid usage record".into());
            }
            let active = match collection.as_str() {
                "tasks" => match value["status"].as_str() {
                    Some(
                        "queued" | "submitting" | "submission-unknown" | "generating" | "retrieval-failed"
                        | "downloading" | "download-failed",
                    ) => true,
                    Some("completed" | "cancelled" | "failed") => false,
                    _ => return Err("Invalid task status".into()),
                },
                "batches" => match value.get("cloud") {
                    None | Some(Value::Null) => false,
                    Some(cloud) => cloud["groups"]
                        .as_array()
                        .ok_or("Invalid batch groups")?
                        .iter()
                        .any(|group| {
                            !matches!(
                                group["status"].as_str(),
                                Some("completed" | "failed" | "cancelled" | "expired")
                            )
                        }),
                },
                _ => true,
            };
            if active {
                collect(&value, &mut ids);
            }
        }
    }
    for job in app.state::<Scheduler>().snapshot()? {
        ids.insert(job.asset_id);
        ids.insert(job.id);
    }
    Ok(ids)
}

fn stored_policy(store: &Store) -> Result<CleanupPolicy, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let body: Option<String> = db
        .query_row(
            "SELECT body FROM records WHERE collection='preferences' AND id='preferences'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let policy = if let Some(body) = body {
        let preferences: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        match preferences.get("localCleanup") {
            None => CleanupPolicy::default(),
            Some(value) => serde_json::from_value(value.clone()).map_err(|e| e.to_string())?,
        }
    } else {
        CleanupPolicy::default()
    };
    cleanup_policy::validate_policy(&policy)?;
    Ok(policy)
}

fn image_rows(store: &Store) -> Result<Vec<(String, String, Value)>, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(IMAGE_ROWS).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        let (collection, id, body) = row.map_err(|e| e.to_string())?;
        Ok((collection, id, serde_json::from_str(&body).map_err(|e| e.to_string())?))
    })
    .collect()
}

fn now_ms() -> Result<u64, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64)
}

#[tauri::command]
pub async fn local_files_query(
    app: tauri::AppHandle,
    keep_ids: Vec<String>,
    filter: Option<String>,
    source: Option<String>,
    search: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
        let root = store.library.read().map_err(|e| e.to_string())?;
        let policy = stored_policy(&store)?;
        let usage = in_use_ids(&app, &keep_ids)?;
        let now = now_ms()?;
        let mut rows = image_rows(&store)?;
        let duplicates: HashSet<String> = {
            let db = store.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db.prepare("SELECT id FROM records WHERE collection IN ('gallery','outputs') GROUP BY id HAVING count(*)>1").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
            rows.collect::<Result<HashSet<_>, _>>().map_err(|e| e.to_string())?
        };
        rows.sort_by(|a, b| b.2["addedAt"].as_u64().unwrap_or(0).cmp(&a.2["addedAt"].as_u64().unwrap_or(0)).then_with(|| a.1.cmp(&b.1)));
        let search = search.unwrap_or_default().trim().to_lowercase();
        let mut results = Vec::new();
        for (_, id, entry) in rows {
            let protected = cleanup_policy::is_protected(&entry);
            let in_use = usage.contains(&id);
            let paths = safe_paths(&root, &id, &entry);
            let can_delete = !duplicates.contains(&id) && paths.is_ok() && cleanup_policy::manual_candidate(&entry, &usage);
            let valid_id = uuid::Uuid::parse_str(&id).ok().map(|id| id.to_string()).as_deref() == Some(&id)
                && entry["asset"]["id"].as_str() == Some(&id);
            let image = valid_id.then(|| checked_file(&root, "assets", &entry, "path", &id).ok()).flatten();
            let thumbnail = valid_id.then(|| checked_file(&root, "thumbnails", &entry, "thumbnailPath", &id).ok()).flatten();
            if !id.to_lowercase().contains(&search)
                || source.as_deref().is_some_and(|source| source != "all" && entry["source"].as_str() != Some(source))
                || match filter.as_deref().unwrap_or("all") {
                    "all" => false,
                    "eligible" => !can_delete,
                    "protected" => !protected,
                    "inUse" => !in_use,
                    _ => true,
                }
            { continue; }
            results.push(json!({
                "entry":entry,
                "bytes":image.as_ref().and_then(|(_, bytes)| *bytes).unwrap_or(0),
                "thumbnailBytes":thumbnail.as_ref().and_then(|(_, bytes)| *bytes).unwrap_or(0),
                "protected":protected,
                "inUse":in_use,
                "canDelete":can_delete,
                "automaticEligible":!duplicates.contains(&id) && paths.is_ok() && cleanup_policy::automatic_candidate(&entry, &policy, now, &usage),
                "missing":image.as_ref().is_some_and(|(_, bytes)| bytes.is_none())
            }));
        }
        let total = results.len();
        let offset = offset.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(80).clamp(1, 200) as usize;
        Ok(json!({"entries":results.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),"total":total}))
    }).await.map_err(|e| e.to_string())?
}

fn remove_selected(
    app: &tauri::AppHandle,
    ids: Vec<String>,
    keep_ids: Vec<String>,
    automatic: bool,
) -> Result<Value, String> {
    let store = app.state::<Store>();
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let root = store.library.read().map_err(|e| e.to_string())?;
    let policy = if automatic { Some(stored_policy(&store)?) } else { None };
    let now = now_ms()?;
    let mut deleted = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id.clone()) {
            continue;
        }
        let records = (|| -> Result<Vec<String>, String> {
            let db = store.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db
                .prepare("SELECT body FROM records WHERE collection IN ('gallery','outputs') AND id=?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([&id], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        })();
        let records = match records {
            Ok(records) => records,
            Err(message) => {
                errors.push(json!({"id":id,"message":message}));
                continue;
            }
        };
        let entry: Value = match records.as_slice() {
            [] => {
                skipped.push(json!({"id":id,"reason":"missingRecord"}));
                continue;
            }
            [body] => match serde_json::from_str(body) {
                Ok(entry) => entry,
                Err(_) => {
                    skipped.push(json!({"id":id,"reason":"invalid"}));
                    continue;
                }
            },
            _ => {
                skipped.push(json!({"id":id,"reason":"invalid"}));
                continue;
            }
        };
        let usage = match in_use_ids(app, &keep_ids) {
            Ok(usage) => usage,
            Err(message) => {
                errors.push(json!({"id":id,"message":message}));
                continue;
            }
        };
        let reason = if cleanup_policy::is_protected(&entry) {
            Some("protected")
        } else if usage.contains(&id) {
            Some("inUse")
        } else if !cleanup_policy::manual_candidate(&entry, &usage)
            || policy
                .as_ref()
                .is_some_and(|policy| !cleanup_policy::automatic_candidate(&entry, policy, now, &usage))
        {
            Some("invalid")
        } else {
            safe_paths(&root, &id, &entry).err()
        };
        if let Some(reason) = reason {
            skipped.push(json!({"id":id,"reason":reason}));
            continue;
        }
        match assets::delete_asset_locked(&store, &id, &root) {
            Ok(()) => deleted.push(id),
            Err(message) => errors.push(json!({"id":id,"message":message})),
        }
    }
    Ok(json!({"deleted":deleted,"skipped":skipped,"errors":errors}))
}

#[tauri::command]
pub async fn local_files_delete(
    app: tauri::AppHandle,
    ids: Vec<String>,
    keep_ids: Vec<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || remove_selected(&app, ids, keep_ids, false))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn local_files_cleanup(app: tauri::AppHandle, keep_ids: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Store>();
        let ids = {
            let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
            let policy = stored_policy(&store)?;
            let usage = in_use_ids(&app, &keep_ids)?;
            let now = now_ms()?;
            image_rows(&store)?
                .into_iter()
                .filter_map(|(_, id, entry)| {
                    cleanup_policy::automatic_candidate(&entry, &policy, now, &usage).then_some(id)
                })
                .collect()
        };
        remove_selected(&app, ids, keep_ids, true)
    })
    .await
    .map_err(|e| e.to_string())?
}
