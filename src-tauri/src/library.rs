use crate::{assets, storage::Store};
use rusqlite::{params_from_iter, types::Value as SqlValue};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryQuery {
    pub collection: Option<String>,
    pub search: Option<String>,
    pub from: Option<i64>,
    pub until: Option<i64>,
    pub orientation: Option<String>,
    pub kind: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub tag: Option<String>,
    pub availability: Option<String>,
    pub sort: Option<String>,
    pub through: Option<i64>,
    pub ids: Option<Vec<String>>,
}

fn query_sql(query: &GalleryQuery) -> (String, Vec<SqlValue>) {
    let mut clauses = vec![
        "collection='gallery'".to_string(),
        "json_extract(body,'$.staged') IS NULL".to_string(),
    ];
    let mut values = vec![];
    let mut add = |sql: &str, value: SqlValue| {
        clauses.push(sql.into());
        values.push(value);
    };
    if let Some(ids) = &query.ids {
        add(
            "id IN (SELECT value FROM json_each(?))",
            serde_json::to_string(ids).unwrap_or_else(|_| "[]".into()).into(),
        );
    }
    if let Some(collection) = query.collection.as_deref().filter(|v| *v != "all") {
        match collection {
            "favorites" => add("json_extract(body,'$.favorite')= ?", 1.into()),
            "generated" | "imported" => add("json_extract(body,'$.source')= ?", collection.to_string().into()),
            _ => add(
                "EXISTS(SELECT 1 FROM json_each(body,'$.boardIds') WHERE value= ?)",
                collection.to_string().into(),
            ),
        }
    }
    if let Some(search) = query.search.as_ref().filter(|v| !v.trim().is_empty()) {
        add("instr(lower(id), lower(?)) > 0", search.trim().to_string().into());
    }
    for (bound, sql) in [
        (&query.from, "json_extract(body,'$.addedAt') >= ?"),
        (&query.until, "json_extract(body,'$.addedAt') < ?"),
        (&query.through, "json_extract(body,'$.addedAt') <= ?"),
    ] {
        if let Some(bound) = bound {
            add(sql, (*bound).into());
        }
    }
    for (value, field) in [
        (&query.kind, "kind"),
        (&query.model, "model"),
        (&query.provider, "provider"),
    ] {
        if let Some(value) = value.as_ref().filter(|v| v.as_str() != "all" && !v.is_empty()) {
            let sql = if field == "kind" {
                "COALESCE(json_extract(body,'$.provenance.kind'), CASE json_extract(body,'$.source') WHEN 'imported' THEN 'import' ELSE 'generation' END)= ?".to_string()
            } else {
                format!("json_extract(body,'$.provenance.{field}')= ?")
            };
            add(&sql, value.clone().into());
        }
    }
    if let Some(tag) = query.tag.as_ref().filter(|v| !v.is_empty()) {
        add(
            "EXISTS(SELECT 1 FROM json_each(body,'$.tags') WHERE value= ?)",
            tag.clone().into(),
        );
    }
    if let Some(availability) = query.availability.as_ref().filter(|v| v.as_str() != "all") {
        add(
            "COALESCE(json_extract(body,'$.availability'),'unknown')= ?",
            availability.clone().into(),
        );
    }
    match query.orientation.as_deref() {
        Some("square") => clauses.push("json_extract(body,'$.asset.width')=json_extract(body,'$.asset.height')".into()),
        Some("landscape") => {
            clauses.push("json_extract(body,'$.asset.width')>json_extract(body,'$.asset.height')".into())
        }
        Some("portrait") => {
            clauses.push("json_extract(body,'$.asset.width')<json_extract(body,'$.asset.height')".into())
        }
        _ => {}
    }
    let sort = match query.sort.as_deref() {
        Some("oldest") => "json_extract(body,'$.addedAt') ASC, id ASC",
        Some("size") => "json_extract(body,'$.bytes') IS NULL, json_extract(body,'$.bytes') DESC, id ASC",
        _ => "json_extract(body,'$.addedAt') DESC, id ASC",
    };
    (
        format!("FROM records WHERE {} ORDER BY {sort}", clauses.join(" AND ")),
        values,
    )
}

#[tauri::command]
pub fn gallery_query(
    store: tauri::State<Store>,
    query: GalleryQuery,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Value, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let (sql, mut values) = query_sql(&query);
    let total: i64 = db
        .query_row(
            &format!("SELECT count(*) {sql}"),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    values.push(i64::from(limit.unwrap_or(80).clamp(1, 200)).into());
    values.push(i64::from(offset.unwrap_or(0)).into());
    let mut statement = db
        .prepare(&format!("SELECT body {sql} LIMIT ? OFFSET ?"))
        .map_err(|e| e.to_string())?;
    let entries = statement
        .query_map(params_from_iter(values.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .map(|row| serde_json::from_str::<Value>(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({"entries":entries,"total":total}))
}

#[tauri::command]
pub fn gallery_ids(store: tauri::State<Store>, query: GalleryQuery) -> Result<Vec<String>, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let (sql, values) = query_sql(&query);
    let mut statement = db.prepare(&format!("SELECT id {sql}")).map_err(|e| e.to_string())?;
    let result = statement
        .query_map(params_from_iter(values.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn gallery_entries(store: tauri::State<Store>, ids: Vec<String>) -> Result<Vec<Value>, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut result = vec![];
    let mut stmt = db
        .prepare("SELECT body FROM records WHERE collection='gallery' AND id=?1")
        .map_err(|e| e.to_string())?;
    for id in ids {
        if let Ok(body) = stmt.query_row([id], |row| row.get::<_, String>(0)) {
            result.push(serde_json::from_str(&body).map_err(|e| e.to_string())?);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn gallery_facets(store: tauri::State<Store>) -> Result<Value, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut result = json!({"counts":{}});
    for (name, condition) in [
        ("all", "1"),
        ("generated", "json_extract(body,'$.source')='generated'"),
        ("imported", "json_extract(body,'$.source')='imported'"),
        ("favorites", "json_extract(body,'$.favorite')=1"),
    ] {
        result["counts"][name] = json!(db
            .query_row(
                &format!("SELECT count(*) FROM records WHERE collection='gallery' AND json_extract(body,'$.staged') IS NULL AND {condition}"),
                [],
                |row| row.get::<_, i64>(0)
            )
            .map_err(|e| e.to_string())?);
    }
    {
        let mut stmt=db.prepare("SELECT value,count(*) FROM records,json_each(body,'$.boardIds') WHERE collection='gallery' AND json_extract(body,'$.staged') IS NULL GROUP BY value").map_err(|e|e.to_string())?;
        for row in stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?
        {
            let (id, count) = row.map_err(|e| e.to_string())?;
            result["counts"][id] = json!(count);
        }
    }
    for field in ["model", "provider"] {
        let mut stmt=db.prepare(&format!("SELECT DISTINCT json_extract(body,'$.provenance.{field}') FROM records WHERE collection='gallery' AND json_extract(body,'$.staged') IS NULL AND json_extract(body,'$.provenance.{field}') IS NOT NULL ORDER BY 1")).map_err(|e|e.to_string())?;
        result[field] = json!(stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?);
    }
    let mut stmt=db.prepare("SELECT DISTINCT value FROM records,json_each(body,'$.tags') WHERE collection='gallery' AND json_extract(body,'$.staged') IS NULL ORDER BY value COLLATE NOCASE").map_err(|e|e.to_string())?;
    result["tags"] = json!(stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?);
    Ok(result)
}

#[tauri::command]
pub fn gallery_mutate(
    store: tauri::State<Store>,
    ids: Vec<String>,
    action: String,
    value: String,
    from: Option<String>,
) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let mut db = store.db.lock().map_err(|e| e.to_string())?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        let body: String = tx
            .query_row(
                "SELECT body FROM records WHERE collection='gallery' AND id=?1",
                [&id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut entry: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        match action.as_str() {
            "favorite" => {
                entry["favorite"] = json!(if value == "toggle" {
                    entry["favorite"] != true
                } else {
                    value == "true"
                })
            }
            "tag" | "untag" | "rename-tag" | "board" | "move" | "unboard" => {
                let field = if action.contains("tag") { "tags" } else { "boardIds" };
                let mut list = entry[field].as_array().cloned().unwrap_or_default();
                if let Some(ref old) = from {
                    if action == "move" || action == "rename-tag" {
                        list.retain(|item| item.as_str() != Some(old));
                    }
                }
                if action == "untag" || action == "unboard" {
                    list.retain(|item| item.as_str() != Some(&value));
                } else if !value.trim().is_empty() && !list.iter().any(|item| item.as_str() == Some(value.trim())) {
                    list.push(json!(value.trim()));
                }
                entry[field] = json!(list);
            }
            _ => return Err("Unknown gallery action".into()),
        }
        tx.execute(
            "UPDATE records SET body=?2 WHERE collection='gallery' AND id=?1",
            rusqlite::params![id, entry.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn asset_provenance(store: tauri::State<Store>, id: String, provenance: Value) -> Result<(), String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE records SET body=json_set(body,'$.provenance',json(?2)) WHERE collection='gallery' AND id=?1",
        rusqlite::params![id, provenance.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn gallery_backfill_provenance(store: tauri::State<Store>, entries: Vec<Value>) -> Result<(), String> {
    let mut db = store.db.lock().map_err(|e| e.to_string())?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for entry in entries {
        let id = entry["id"].as_str().ok_or("Invalid asset ID")?;
        tx.execute("UPDATE records SET body=json_set(body,'$.provenance',json(?2)) WHERE collection='gallery' AND id=?1 AND json_extract(body,'$.provenance.model') IS NULL",rusqlite::params![id,entry["provenance"].to_string()]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn asset_copy(
    store: tauri::State<Store>,
    clipboard: tauri::State<crate::clipboard::Clipboard>,
    id: String,
) -> Result<(), String> {
    let entry = assets::entry(&store, &id)?;
    let path = entry["path"].as_str().ok_or("Missing image")?;
    let image = decode_image(Path::new(path))?.into_rgba8();
    let (width, height) = image.dimensions();
    clipboard.with(|clipboard| {
        clipboard.set_image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: std::borrow::Cow::Owned(image.into_raw()),
        })
    })
}

#[tauri::command]
pub fn asset_paste(
    store: tauri::State<Store>,
    clipboard: tauri::State<crate::clipboard::Clipboard>,
    staged: Option<bool>,
) -> Result<Value, String> {
    let image = clipboard.with(|clipboard| clipboard.get_image())?;
    let rgba = image::RgbaImage::from_raw(
        image.width.try_into().map_err(|_| "Invalid clipboard dimensions")?,
        image.height.try_into().map_err(|_| "Invalid clipboard dimensions")?,
        image.bytes.into_owned(),
    )
    .ok_or("Invalid clipboard image")?;
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(rgba)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    assets::save_asset(&store, &bytes.into_inner(), "imported", staged == Some(true))
}

#[tauri::command]
pub fn assets_publish(store: tauri::State<Store>, ids: Vec<String>) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    store
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute(
            "UPDATE records SET body=json_set(json_remove(body,'$.staged'),'$.addedAt',?1) WHERE collection='gallery' AND json_extract(body,'$.staged')=1 AND id IN (SELECT value FROM json_each(?2))",
            rusqlite::params![now, serde_json::to_string(&ids).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn staging_purge(store: tauri::State<Store>, keep: Vec<String>) -> Result<Vec<String>, String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let root = store.library.read().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Ok(vec![]);
    }
    let ids = {
        let db = store.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare(
                "SELECT id FROM records WHERE collection='gallery' AND json_extract(body,'$.staged')=1 AND id NOT IN (SELECT value FROM json_each(?1))",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                [serde_json::to_string(&keep).map_err(|e| e.to_string())?],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    for id in &ids {
        assets::delete_asset_locked(&store, id, &root)?;
    }
    Ok(ids)
}

fn decode_image(path: &Path) -> Result<image::DynamicImage, String> {
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("svg"))
    {
        return image::open(path).map_err(|e| e.to_string());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut options = resvg::usvg::Options::default();
    options.fontdb_mut().load_system_fonts();
    let tree = resvg::usvg::Tree::from_data(&bytes, &options).map_err(|e| e.to_string())?;
    let size = tree.size().to_int_size();
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height()).ok_or("Invalid SVG size")?;
    resvg::render(&tree, resvg::tiny_skia::Transform::default(), &mut pixmap.as_mut());
    image::load_from_memory(&pixmap.encode_png().map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn rows(store: &Store) -> Result<Vec<Value>, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT body FROM records WHERE collection='gallery' AND json_extract(body,'$.staged') IS NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|row| serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub fn gallery_cleanup(store: tauri::State<Store>, policies: Value) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let root = store.library.read().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Ok(());
    }
    let mut all = rows(&store)?;
    all.sort_by_key(|row| row["addedAt"].as_i64().unwrap_or(0));
    for source in ["generated", "imported"] {
        if policies[source]["enabled"] != true {
            continue;
        }
        let capacity = policies[source]["capacity"]
            .as_u64()
            .filter(|v| *v >= 30)
            .ok_or("Invalid cleanup capacity")? as usize;
        let eligible: Vec<_> = all
            .iter()
            .filter(|row| {
                row["source"] == source
                    && row["favorite"] != true
                    && row["boardIds"].as_array().is_none_or(|v| v.is_empty())
            })
            .collect();
        for row in eligible.iter().take(eligible.len().saturating_sub(capacity)) {
            assets::delete_asset_locked(&store, row["asset"]["id"].as_str().ok_or("Invalid asset")?, &root)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn library_stats(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || library_stats_inner(&app.state::<Store>()))
        .await
        .map_err(|error| error.to_string())?
}

fn library_stats_inner(store: &Store) -> Result<Value, String> {
    let root = store.library_root()?;
    let all = rows(&store)?;
    let mut result = json!({"directory":root,"available":root.is_dir(),"count":all.len(),"bytes":0u64,"thumbnailBytes":0u64,"missing":0,"eligible":{"generated":0,"imported":0}});
    for entry in all {
        if let Some(path) = entry["path"].as_str() {
            if let Ok(meta) = std::fs::metadata(path) {
                result["bytes"] = json!(result["bytes"].as_u64().unwrap_or(0) + meta.len());
            } else {
                result["missing"] = json!(result["missing"].as_u64().unwrap_or(0) + 1);
            }
        }
        if let Some(path) = entry["thumbnailPath"].as_str() {
            if let Ok(meta) = std::fs::metadata(path) {
                result["thumbnailBytes"] = json!(result["thumbnailBytes"].as_u64().unwrap_or(0) + meta.len());
            }
        }
        if entry["favorite"] != true && entry["boardIds"].as_array().is_none_or(|v| v.is_empty()) {
            if let Some(source) = entry["source"].as_str() {
                result["eligible"][source] = json!(result["eligible"][source].as_u64().unwrap_or(0) + 1);
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn library_maintain(
    app: tauri::AppHandle,
    action: String,
    ids: Option<Vec<String>>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || library_maintain_inner(&app.state::<Store>(), action, ids))
        .await
        .map_err(|error| error.to_string())?
}

fn library_maintain_inner(store: &Store, action: String, ids: Option<Vec<String>>) -> Result<Value, String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let root = store.library.read().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Library folder is unavailable".into());
    }
    let all = rows(&store)?;
    let mut missing = vec![];
    let mut repaired = 0;
    for mut entry in all {
        let id = entry["asset"]["id"].as_str().ok_or("Invalid asset")?.to_string();
        let path = PathBuf::from(entry["path"].as_str().ok_or("Invalid path")?);
        if !path.is_file() {
            missing.push(id.clone());
            entry["availability"] = json!("missing");
            if action == "remove" && ids.as_ref().is_some_and(|ids| ids.contains(&id)) {
                assets::delete_asset_locked(&store, &id, &root)?;
                continue;
            }
        } else {
            entry["availability"] = json!("available");
            entry["bytes"] = json!(std::fs::metadata(&path).map_err(|e| e.to_string())?.len());
            if action == "thumbnails" {
                let image = decode_image(&path)?;
                image
                    .thumbnail(480, 480)
                    .save_with_format(
                        entry["thumbnailPath"].as_str().ok_or("Invalid thumbnail")?,
                        image::ImageFormat::Png,
                    )
                    .map_err(|e| e.to_string())?;
                repaired += 1;
            }
        }
        store.db.lock().map_err(|e|e.to_string())?.execute("UPDATE records SET body=json_set(body,'$.availability',?2,'$.bytes',?3) WHERE collection='gallery' AND id=?1",rusqlite::params![id,entry["availability"].as_str(),entry["bytes"].as_u64()]).map_err(|e|e.to_string())?;
    }
    Ok(json!({"missing":missing,"repaired":repaired}))
}

pub fn auto_export(store: &Store, entry: &Value, kind: &str) -> Result<(), String> {
    let prefs = store
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .query_row(
            "SELECT body FROM records WHERE collection='preferences' AND id='preferences'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or_default();
    let enabled = if kind == "upscale" {
        "upscaleAuto"
    } else {
        "generationAuto"
    };
    if prefs["outputs"][enabled] != true {
        return Ok(());
    }
    let directory = prefs["outputs"]["directory"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or("Output folder is not configured")?;
    let source = Path::new(entry["path"].as_str().ok_or("Invalid asset")?);
    let target = Path::new(directory).join(source.file_name().ok_or("Invalid filename")?);
    if target.exists() {
        if std::fs::read(&target).map_err(|e| e.to_string())? == std::fs::read(source).map_err(|e| e.to_string())? {
            return Ok(());
        }
        return Err("Output file already exists".into());
    }
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| e.to_string())?;
    if let Err(error) = std::fs::File::open(source).and_then(|mut input| std::io::copy(&mut input, &mut output)) {
        drop(output);
        let _ = std::fs::remove_file(target);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn asset_auto_export(store: tauri::State<Store>, id: String, kind: String) -> Result<(), String> {
    let entry = assets::entry(&store, &id)?;
    auto_export(&store, &entry, &kind)
}
