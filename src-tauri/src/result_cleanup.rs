use crate::storage::Store;
use std::collections::HashSet;

/// Discard only generated response staging files after their task records are gone.
#[tauri::command]
pub fn result_discard(store: tauri::State<Store>, urls: Vec<String>) -> Result<usize, String> {
    let mut ids = HashSet::new();
    for url in urls {
        let layers = url.starts_with("staged-layers:");
        let Some(value) = url.strip_prefix(if layers { "staged-layers:" } else { "staged:" }) else {
            continue;
        };
        let id = uuid::Uuid::parse_str(value).map_err(|_| "Invalid staged result ID")?;
        if id.to_string() != value {
            return Err("Expected a canonical staged result ID".into());
        }
        ids.insert((id.to_string(), layers));
    }
    let db = store.db.lock().map_err(|error| error.to_string())?;
    let mut removed = 0;
    for (id, layers) in ids {
        let url = format!("staged:{id}");
        let referenced = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM records, json_each(records.body,'$.results') AS result \
                 WHERE records.collection='tasks' AND (json_extract(result.value,'$.url')=?1 \
                 OR json_extract(result.value,'$.id')=?2 \
                 OR EXISTS(SELECT 1 FROM json_each(result.value,'$.layerSources') AS layer \
                 WHERE json_extract(layer.value,'$.url')=?1)))",
                [&url, &id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| error.to_string())?;
        if referenced {
            continue;
        }
        if layers {
            let directory = store.root.join("staging").join("layers").join(&id);
            if !directory.exists() {
                continue;
            }
            for entry in std::fs::read_dir(&directory).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
            }
            std::fs::remove_dir(directory).map_err(|e| e.to_string())?;
            removed += 1;
            continue;
        }
        match std::fs::remove_file(store.root.join("staging").join(id)) {
            Ok(()) => removed += 1,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(removed)
}
