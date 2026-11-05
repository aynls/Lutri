mod cache;
mod graph;
mod worker;
use crate::{assets, storage::Store};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::{ipc::Channel, Manager};

#[derive(Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Architecture {
    #[default]
    Esrgan,
    General,
    CuganPro,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJob {
    runtime: PathBuf,
    param: PathBuf,
    bin: PathBuf,
    input: PathBuf,
    output: PathBuf,
    native_scale: u32,
    output_scale: u32,
    tile_size: u32,
    pipeline_cache: Option<PathBuf>,
    gpu_index: Option<i32>,
    architecture: Architecture,
}

pub fn run_worker(path: &str) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let job: WorkerJob = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    worker::run(&job, true)
}

fn resources(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("resources/upscale");
    if bundled.is_dir() {
        return Ok(bundled);
    }
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/upscale"))
}

#[tauri::command]
pub fn upscale_models(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    let root = resources(&app)?.join("models");
    let mut models = vec![];
    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("param") || !path.with_extension("bin").is_file() {
            continue;
        }
        let id = path.file_stem().unwrap().to_string_lossy().into_owned();
        let scale = if id.contains("2x") {
            2
        } else if id.contains("3x") && !id.contains("denoise3x") {
            3
        } else if id.starts_with("realcugan-pro-3x") {
            3
        } else {
            4
        };
        models.push(json!({"id":id,"name":id.replace('-'," "),"scale":scale}));
    }
    Ok(models)
}

#[tauri::command]
pub async fn upscale_run(
    app: tauri::AppHandle,
    asset_id: String,
    model_id: String,
    scale: u32,
    tile_size: u32,
    destination: Option<String>,
    save_to_gallery: bool,
    channel: Channel<Value>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !(1..=4).contains(&scale) || !(32..=512).contains(&tile_size) {
            return Err("Invalid upscale parameters".into());
        }
        let models = upscale_models(app.clone())?;
        let model = models
            .iter()
            .find(|m| m["id"].as_str() == Some(&model_id))
            .ok_or("Unknown upscale model")?;
        let store = app.state::<Store>();
        let body: String = store
            .db
            .lock()
            .map_err(|e| e.to_string())?
            .query_row(
                "SELECT body FROM records WHERE collection='gallery' AND id=?1",
                [asset_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let entry: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        let root = resources(&app)?;
        let id = uuid::Uuid::new_v4().to_string();
        let output = store.root.join("staging").join(format!("{id}.png"));
        let runtime = root.join("windows-x86_64/ncnn.dll");
        worker::check_runtime(&runtime)?;
        let input = PathBuf::from(entry["path"].as_str().ok_or("Missing source image")?);
        let _ = worker::oriented_dimensions(image::ImageReader::open(&input).map_err(|e| e.to_string())?)?;
        let job = WorkerJob {
            runtime,
            param: root.join("models").join(format!("{model_id}.param")),
            bin: root.join("models").join(format!("{model_id}.bin")),
            input,
            output: output.clone(),
            native_scale: model["scale"].as_u64().unwrap() as u32,
            output_scale: scale,
            tile_size,
            pipeline_cache: None,
            gpu_index: None,
            architecture: if model_id.starts_with("realcugan") {
                Architecture::CuganPro
            } else if model_id.contains("general") {
                Architecture::General
            } else {
                Architecture::Esrgan
            },
        };
        let job_path = store.root.join("staging").join(format!("{id}.json"));
        std::fs::write(&job_path, serde_json::to_vec(&job).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
        command
            .arg("--upscale-worker")
            .arg(&job_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let mut error = None;
        for line in BufReader::new(child.stdout.take().ok_or("Worker output unavailable")?).lines() {
            let line = line.map_err(|e| e.to_string())?;
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if let Some(message) = value["error"].as_str() {
                    error = Some(message.to_owned());
                }
                let _ = channel.send(value);
            }
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(error.unwrap_or_else(|| format!("Upscale worker exited: {status}")));
        }
        let mut saved_path = output.clone();
        if let Some(directory) = destination {
            saved_path = PathBuf::from(directory).join(format!("{id}.png"));
            std::fs::copy(&output, &saved_path).map_err(|e| e.to_string())?;
        }
        let gallery = if save_to_gallery {
            Some(assets::save_asset(
                &store,
                &std::fs::read(&output).map_err(|e| e.to_string())?,
                format!("{} ×{scale}", entry["asset"]["name"].as_str().unwrap_or("Image")),
                "generated",
            )?)
        } else {
            None
        };
        Ok(json!({"path":output,"exportedPath":saved_path,"gallery":gallery}))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn upscale_save(store: tauri::State<Store>, path: String, name: String) -> Result<Value, String> {
    assets::save_asset(
        &store,
        &std::fs::read(path).map_err(|e| e.to_string())?,
        name,
        "generated",
    )
}
