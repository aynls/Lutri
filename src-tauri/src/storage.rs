use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Mutex, RwLock},
};
use tauri::Manager;

pub struct Store {
    pub root: PathBuf,
    pub db: Mutex<Connection>,
    pub library: RwLock<PathBuf>,
    pub library_mutation: Mutex<()>,
}

impl Store {
    pub fn open(app: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let root = app.path().app_data_dir()?;
        let configuration = root.join("library.json");
        let mut library = std::fs::read(&configuration)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PathBuf>(&bytes).ok())
            .unwrap_or_else(|| root.clone());
        std::fs::create_dir_all(root.join("staging"))?;
        let db = Connection::open(root.join("lutri.sqlite3"))?;
        db.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=FULL;
             CREATE TABLE IF NOT EXISTS records (
                 collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
                 PRIMARY KEY(collection, id)
             );",
        )?;
        // The journal survives a crash between committing paths and updating the locator.
        let journal = root.join("library-migration.json");
        if let Ok(bytes) = std::fs::read(&journal) {
            if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                let new = PathBuf::from(value["new"].as_str().ok_or("Invalid library migration journal")?);
                let old = PathBuf::from(value["old"].as_str().ok_or("Invalid library migration journal")?);
                let committed = db
                    .query_row(
                        "SELECT body FROM records WHERE collection='library' AND id='location'",
                        [],
                        |row| row.get::<_, String>(0),
                    )
                    .ok()
                    .and_then(|body| serde_json::from_str::<Value>(&body).ok())
                    .is_some_and(|v| v["directory"] == value["new"]);
                library = if committed { new } else { old };
                std::fs::write(&configuration, serde_json::to_vec(&library)?)?;
                if committed {
                    std::fs::remove_file(journal)?;
                }
            }
        }
        // Never recreate a previously configured, disconnected library automatically.
        if !configuration.exists() {
            std::fs::create_dir_all(library.join("assets"))?;
            std::fs::create_dir_all(library.join("thumbnails"))?;
        }
        db.execute_batch("CREATE INDEX IF NOT EXISTS gallery_added ON records(collection,json_extract(body,'$.addedAt')); PRAGMA user_version=2;")?;
        Ok(Self {
            root,
            db: Mutex::new(db),
            library: RwLock::new(library),
            library_mutation: Mutex::new(()),
        })
    }
    pub fn library_root(&self) -> Result<PathBuf, String> {
        self.library.read().map(|path| path.clone()).map_err(|e| e.to_string())
    }
}

#[derive(Deserialize)]
pub struct RecordChange {
    collection: String,
    id: String,
    value: Option<Value>,
}

#[tauri::command]
pub fn records_read(store: tauri::State<Store>, collection: String) -> Result<Vec<Value>, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut statement = db
        .prepare("SELECT body FROM records WHERE collection=?1 ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([collection], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        let body = row.map_err(|e| e.to_string())?;
        serde_json::from_str(&body).map_err(|e| e.to_string())
    })
    .collect()
}

#[tauri::command]
pub fn records_commit(store: tauri::State<Store>, changes: Vec<RecordChange>) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let library = store.library.read().map_err(|e| e.to_string())?;
    let mut db = store.db.lock().map_err(|e| e.to_string())?;
    let transaction = db.transaction().map_err(|e| e.to_string())?;
    for change in changes {
        if let Some(mut value) = change.value {
            if change.collection == "gallery" {
                // Ignore stale absolute paths from a window opened before a migration.
                for (key, directory) in [("path", "assets"), ("thumbnailPath", "thumbnails")] {
                    if let Some(name) = value[key]
                        .as_str()
                        .and_then(|path| std::path::Path::new(path).file_name())
                    {
                        value[key] = serde_json::json!(library.join(directory).join(name));
                    }
                }
            }
            transaction.execute(
                "INSERT INTO records(collection,id,body) VALUES(?1,?2,?3)
                 ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body",
                params![change.collection, change.id, value.to_string()],
            )
        } else {
            transaction.execute(
                "DELETE FROM records WHERE collection=?1 AND id=?2",
                params![change.collection, change.id],
            )
        }
        .map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_migrate(app: tauri::AppHandle, directory: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || migrate_library(&app, &app.state::<Store>(), directory))
        .await
        .map_err(|error| error.to_string())?
}

fn migrate_library(app: &tauri::AppHandle, store: &Store, directory: String) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    if app.state::<crate::upscale::Scheduler>().is_busy() {
        return Err("Finish or cancel upscale jobs before moving the library".into());
    }
    let mut library = store.library.try_write().map_err(|_| "Library is busy")?;
    let old = library.clone();
    let new = std::fs::canonicalize(&directory).map_err(|e| e.to_string())?;
    let old_canonical = std::fs::canonicalize(&old).map_err(|e| e.to_string())?;
    if old_canonical == new {
        return Ok(());
    }
    if new.starts_with(&old_canonical) || old_canonical.starts_with(&new) {
        return Err("Choose a folder outside the current library".into());
    }
    let journal = store.root.join("library-migration.json");
    let resuming = std::fs::read(&journal)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .is_some_and(|value| value["new"] == serde_json::json!(new) && value["old"] == serde_json::json!(old));
    for folder in ["assets", "thumbnails"] {
        if new.join(folder).exists() && !resuming {
            return Err("Destination already contains library files".into());
        }
    }
    std::fs::write(
        &journal,
        serde_json::to_vec(&serde_json::json!({"old":old,"new":new})).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let mut db = store.db.lock().map_err(|e| e.to_string())?;
    let mut entries = {
        let mut stmt = db
            .prepare("SELECT collection,id,body FROM records WHERE collection IN ('gallery','masks')")
            .map_err(|e| e.to_string())?;
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
            Ok((
                collection,
                id,
                serde_json::from_str::<Value>(&body).map_err(|e| e.to_string())?,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?
    };
    let prepared = (|| -> Result<(), String> {
        for folder in ["assets", "thumbnails"] {
            std::fs::create_dir_all(new.join(folder)).map_err(|e| e.to_string())?;
        }
        for (_, _, entry) in &mut entries {
            for (key, folder) in [("path", "assets"), ("thumbnailPath", "thumbnails")] {
                let source = PathBuf::from(entry[key].as_str().ok_or("Invalid asset path")?);
                let destination = new
                    .join(folder)
                    .join(source.file_name().ok_or("Invalid asset filename")?);
                if source.is_file() {
                    let bytes = std::fs::read(&source).map_err(|e| e.to_string())?;
                    if destination.exists() {
                        if !resuming || bytes != std::fs::read(&destination).map_err(|e| e.to_string())? {
                            return Err("Destination contains different image data".into());
                        }
                    } else {
                        let temporary = destination.with_extension("copying");
                        std::fs::write(&temporary, &bytes).map_err(|e| e.to_string())?;
                        if bytes != std::fs::read(&temporary).map_err(|e| e.to_string())? {
                            return Err("Copied image verification failed".into());
                        }
                        std::fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
                    }
                    if bytes != std::fs::read(&destination).map_err(|e| e.to_string())? {
                        return Err("Copied image verification failed".into());
                    }
                }
                entry[key] = serde_json::json!(destination);
            }
        }
        Ok(())
    })();
    prepared?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for (collection, id, entry) in &entries {
        tx.execute(
            "UPDATE records SET body=?3 WHERE collection=?1 AND id=?2",
            params![collection, id, entry.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "INSERT OR REPLACE INTO records(collection,id,body) VALUES('library','location',?1)",
        [serde_json::json!({"directory":new}).to_string()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    *library = new.clone();
    for folder in ["assets", "thumbnails"] {
        app.asset_protocol_scope()
            .allow_directory(new.join(folder), true)
            .map_err(|e| e.to_string())?;
    }
    std::fs::write(
        store.root.join("library.json"),
        serde_json::to_vec(&new).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::remove_file(journal).map_err(|e| e.to_string())?;
    // Remove only previously registered files, leaving unrelated user files untouched.
    for (_, _, entry) in entries {
        for (key, folder) in [("path", "assets"), ("thumbnailPath", "thumbnails")] {
            if let Some(name) = entry[key]
                .as_str()
                .and_then(|path| std::path::Path::new(path).file_name())
            {
                let path = old.join(folder).join(name);
                if path.is_file() {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn storage_directory(store: tauri::State<Store>) -> String {
    store.root.to_string_lossy().into_owned()
}
