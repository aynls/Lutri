use crate::storage::Store;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Seek, SeekFrom, Write};
use std::path::PathBuf;

/// Run before the WebView can prepare inputs or resume downloads.
pub fn purge_orphan_files(root: &std::path::Path, db: &rusqlite::Connection) -> Result<(), String> {
    let directory = root.join("batch-files");
    if !directory.is_dir() {
        return Ok(());
    }
    let mut keep = std::collections::HashSet::new();
    let mut statement = db
        .prepare("SELECT body FROM records WHERE collection IN ('batches','tasks')")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let record: Value = serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if let Some(id) = record["cloudGroupId"].as_str() {
            keep.insert(id.to_owned());
        }
        if let Some(groups) = record["cloud"]["groups"].as_array() {
            for group in groups {
                if let Some(id) = group["id"].as_str() {
                    keep.insert(id.to_owned());
                    if let Some(outputs) = group["outputFileIds"].as_array() {
                        for index in 0..outputs.len() {
                            keep.insert(format!("{id}-output-{index}"));
                        }
                    }
                }
            }
        }
    }
    for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(id) = name.strip_suffix(".jsonl").or_else(|| name.strip_suffix(".part")) else {
            continue;
        };
        let group = if let Some((group, index)) = id.split_once("-output-") {
            if index.parse::<usize>().is_err() {
                continue;
            }
            group
        } else {
            id
        };
        let owned = uuid::Uuid::parse_str(group).is_ok_and(|value| value.to_string() == group);
        if owned && !keep.contains(id) {
            std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn path(store: &Store, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid batch file ID".into());
    }
    let directory = store.root.join("batch-files");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join(format!("{id}.jsonl")))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(1800))
        .build()
        .map_err(|e| e.to_string())
}

fn secret(provider: &str) -> Result<String, String> {
    if !matches!(provider, "openai" | "google") {
        return Err("Unsupported batch provider".into());
    }
    keyring::Entry::new("app.lutri.studio", provider)
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|_| "Provider credential unavailable".into())
}

async fn checked(response: reqwest::Response) -> Result<reqwest::Response, String> {
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    Ok(response)
}

/// Append one configuration without making copies of its image payload for each repetition in IPC.
#[tauri::command]
pub fn batch_input_append(
    store: tauri::State<Store>,
    id: String,
    provider: String,
    endpoint: String,
    body: Value,
    task_ids: Vec<String>,
) -> Result<(), String> {
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path(&store, &id)?)
        .map_err(|e| e.to_string())?;
    for task_id in task_ids {
        let line = if provider == "openai" {
            json!({"custom_id": task_id, "method": "POST", "url": endpoint, "body": body})
        } else {
            json!({"key": task_id, "request": body})
        };
        serde_json::to_writer(&mut file, &line).map_err(|e| e.to_string())?;
        file.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    file.sync_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_upload(store: tauri::State<'_, Store>, id: String, provider: String) -> Result<String, String> {
    let input = path(&store, &id)?;
    let bytes = std::fs::metadata(&input).map_err(|e| e.to_string())?.len();
    let key = secret(&provider)?;
    let client = client()?;
    let response = if provider == "openai" {
        let file = reqwest::multipart::Part::file(&input)
            .await
            .map_err(|e| e.to_string())?
            .file_name("requests.jsonl")
            .mime_str("application/jsonl")
            .map_err(|e| e.to_string())?;
        checked(
            client
                .post("https://api.openai.com/v1/files")
                .bearer_auth(&key)
                .multipart(
                    reqwest::multipart::Form::new()
                        .text("purpose", "batch")
                        .part("file", file),
                )
                .send()
                .await
                .map_err(|e| e.to_string())?,
        )
        .await?
    } else {
        let start = checked(
            client
                .post("https://generativelanguage.googleapis.com/upload/v1beta/files")
                .header("x-goog-api-key", &key)
                .header("X-Goog-Upload-Protocol", "resumable")
                .header("X-Goog-Upload-Command", "start")
                .header("X-Goog-Upload-Header-Content-Length", bytes)
                .header("X-Goog-Upload-Header-Content-Type", "application/jsonl")
                .json(&json!({"file": {"display_name": format!("lutri-{id}")}}))
                .send()
                .await
                .map_err(|e| e.to_string())?,
        )
        .await?;
        let url = start
            .headers()
            .get("x-goog-upload-url")
            .and_then(|v| v.to_str().ok())
            .ok_or("Missing upload URL")?;
        let parsed = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
        if parsed.scheme() != "https" || parsed.host_str() != Some("generativelanguage.googleapis.com") {
            return Err("Invalid upload URL".into());
        }
        let file = tokio::fs::File::open(&input).await.map_err(|e| e.to_string())?;
        checked(
            client
                .post(parsed)
                .header("x-goog-api-key", &key)
                .header("X-Goog-Upload-Command", "upload, finalize")
                .header("X-Goog-Upload-Offset", "0")
                .header("Content-Length", bytes)
                .body(file)
                .send()
                .await
                .map_err(|e| e.to_string())?,
        )
        .await?
    };
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    let id = if provider == "openai" {
        value["id"].as_str()
    } else {
        value["file"]["name"].as_str()
    };
    id.map(str::to_owned).ok_or_else(|| "Missing uploaded file ID".into())
}

/// Download large JSONL outputs to disk. The WebView reads one response at a time.
#[tauri::command]
pub async fn batch_output_fetch(
    store: tauri::State<'_, Store>,
    id: String,
    provider: String,
    file_id: String,
) -> Result<(), String> {
    let destination = path(&store, &id)?;
    if destination.exists() {
        return Ok(());
    }
    let key = secret(&provider)?;
    let identifier = file_id.strip_prefix("files/").unwrap_or(&file_id);
    if identifier.is_empty()
        || !identifier
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid output file ID".into());
    }
    let request = if provider == "openai" {
        client()?
            .get(format!("https://api.openai.com/v1/files/{identifier}/content"))
            .bearer_auth(key)
    } else {
        client()?
            .get(format!(
                "https://generativelanguage.googleapis.com/download/v1beta/files/{identifier}:download?alt=media"
            ))
            .header("x-goog-api-key", key)
    };
    let response = checked(request.send().await.map_err(|e| e.to_string())?).await?;
    let temporary = destination.with_extension("part");
    let mut file = tokio::fs::File::create(&temporary).await.map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        file.write_all(&chunk.map_err(|e| e.to_string())?)
            .await
            .map_err(|e| e.to_string())?;
    }
    file.sync_all().await.map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(temporary, destination).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct OutputLine {
    line: String,
    offset: u64,
}

#[tauri::command]
pub fn batch_output_read(store: tauri::State<Store>, id: String, offset: u64) -> Result<OutputLine, String> {
    let mut file = std::fs::File::open(path(&store, &id)?).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut line = String::new();
    let count = BufReader::new(file).read_line(&mut line).map_err(|e| e.to_string())?;
    Ok(OutputLine {
        line,
        offset: offset + count as u64,
    })
}

#[tauri::command]
pub fn batch_files_remove(store: tauri::State<Store>, ids: Vec<String>) -> Result<(), String> {
    for id in ids {
        let file = path(&store, &id)?;
        for path in [file.clone(), file.with_extension("part")] {
            if path.exists() {
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
