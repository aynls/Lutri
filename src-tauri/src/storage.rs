use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::Value;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;

pub struct Store {
    pub root: PathBuf,
    pub db: Mutex<Connection>,
}

impl Store {
    pub fn open(app: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let root = app.path().app_data_dir()?;
        std::fs::create_dir_all(root.join("assets"))?;
        std::fs::create_dir_all(root.join("thumbnails"))?;
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
        Ok(Self {
            root,
            db: Mutex::new(db),
        })
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
    let mut db = store.db.lock().map_err(|e| e.to_string())?;
    let transaction = db.transaction().map_err(|e| e.to_string())?;
    for change in changes {
        if let Some(value) = change.value {
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
pub fn storage_directory(store: tauri::State<Store>) -> String {
    store.root.to_string_lossy().into_owned()
}
