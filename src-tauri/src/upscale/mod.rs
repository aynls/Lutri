mod cache;
mod devices;
mod graph;
mod scheduler;
mod worker;
use crate::{assets, storage::Store};
pub use scheduler::Scheduler;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::{ipc::Channel, Manager};

/// Upscale cards live only for this application session.
pub fn prepare_session(root: &std::path::Path) -> Result<(), String> {
    let directory = root.join("upscale-session");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(&directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(id) = name
            .strip_suffix(".thumb.png")
            .or_else(|| name.strip_suffix(".png"))
            .or_else(|| name.strip_suffix(".json"))
        else {
            continue;
        };
        if uuid::Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id) {
            std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn upscale_discard(
    store: tauri::State<Store>,
    scheduler: tauri::State<Scheduler>,
    ids: Vec<String>,
) -> Result<(), String> {
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let active = scheduler.snapshot()?;
    for id in ids {
        let id = uuid::Uuid::parse_str(&id)
            .map_err(|_| "Invalid upscale job ID")?
            .to_string();
        if active.iter().any(|job| job.id == id) {
            continue;
        }
        for suffix in [".png", ".thumb.png"] {
            let path = store.root.join("upscale-session").join(format!("{id}{suffix}"));
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
        }
    }
    Ok(())
}

struct StagingCleanup {
    control: std::sync::Arc<std::sync::Mutex<scheduler::Job>>,
    output: PathBuf,
    job: PathBuf,
    complete: bool,
}
impl Drop for StagingCleanup {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.job);
        if !self.complete {
            if let Ok(mut task) = self.control.lock() {
                if let Some(child) = task.child.as_mut() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                task.child = None;
            }
            let _ = std::fs::remove_file(&self.output);
            let _ = std::fs::remove_file(self.output.with_extension("thumb.png"));
        }
    }
}

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

fn runtime_path(root: &std::path::Path) -> Result<PathBuf, String> {
    let relative = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x86_64/ncnn.dll",
        ("linux", "x86_64") => "linux-x86_64/libncnn.so",
        _ => return Err("No bundled NCNN runtime for this platform".into()),
    };
    Ok(root.join(relative))
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
    job_id: Option<String>,
    gpu_index: Option<i32>,
    asset_id: String,
    model_id: String,
    scale: u32,
    tile_size: u32,
    destination: Option<String>,
    save_to_gallery: bool,
    channel: Channel<Value>,
) -> Result<Value, String> {
    let id = job_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    uuid::Uuid::parse_str(&id).map_err(|_| "Invalid upscale job ID")?;
    let scheduler = app.state::<Scheduler>();
    let control = {
        let store = app.state::<Store>();
        let _admission = store.library_mutation.lock().map_err(|e| e.to_string())?;
        let entry = assets::entry(&store, &asset_id)?;
        if entry["asset"]["mediaType"].as_str() == Some("image/svg+xml") {
            return Err("SVG_UPSCALE_UNSUPPORTED".into());
        }
        scheduler.register(&id, &asset_id, &model_id, scale)?
    };
    let _ = channel.send(json!({"phase":"queued"}));
    tauri::async_runtime::spawn_blocking(move || {
        let scheduler = app.state::<Scheduler>();
        scheduler.acquire(&id, &control)?;
        let _lease = scheduler::Lease(&scheduler, id.clone());
        if !(1..=4).contains(&scale) || !(32..=512).contains(&tile_size) {
            return Err("Invalid upscale parameters".into());
        }
        let models = upscale_models(app.clone())?;
        let model = models
            .iter()
            .find(|m| m["id"].as_str() == Some(&model_id))
            .ok_or("Unknown upscale model")?;
        let store = app.state::<Store>();
        let entry = assets::entry(&store, &asset_id)?;
        let root = resources(&app)?;
        let output = store.root.join("upscale-session").join(format!("{id}.png"));
        let runtime = runtime_path(&root)?;
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
            gpu_index,
            architecture: if model_id.starts_with("realcugan") {
                Architecture::CuganPro
            } else if model_id.contains("general") {
                Architecture::General
            } else {
                Architecture::Esrgan
            },
        };
        let job_path = store.root.join("upscale-session").join(format!("{id}.json"));
        let mut cleanup = StagingCleanup {
            control: control.clone(),
            output: output.clone(),
            job: job_path.clone(),
            complete: false,
        };
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
        if let Some(index) = gpu_index {
            if index < -1 {
                return Err("Invalid upscale device".into());
            }
            if index >= 0 {
                let devices = probe_devices(&app)?;
                if !devices.iter().any(|d| d["index"].as_i64() == Some(index as i64)) {
                    return Err("The selected device is unavailable".into());
                }
            }
        }
        let stdout = {
            let mut task = control.lock().map_err(|e| e.to_string())?;
            if task.cancelled {
                return Err("cancelled".into());
            }
            let mut child = command.spawn().map_err(|e| e.to_string())?;
            let stdout = child.stdout.take().ok_or("Worker output unavailable")?;
            task.child = Some(child);
            stdout
        };
        let _ = channel.send(json!({"phase":"running"}));
        let mut error = None;
        for line in BufReader::new(stdout).lines() {
            let line = line.map_err(|e| e.to_string())?;
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if let Some(message) = value["error"].as_str() {
                    error = Some(message.to_owned());
                }
                let _ = channel.send(value);
            }
        }
        let mut task = control.lock().map_err(|e| e.to_string())?;
        let status = task
            .child
            .as_mut()
            .ok_or("Worker unavailable")?
            .wait()
            .map_err(|e| e.to_string())?;
        task.child = None;
        if task.cancelled {
            let _ = std::fs::remove_file(&output);
            let _ = std::fs::remove_file(output.with_extension("thumb.png"));
            let _ = std::fs::remove_file(&job_path);
            return Err("cancelled".into());
        }
        task.committing = true;
        drop(task);
        let _ = std::fs::remove_file(&job_path);
        if !status.success() {
            return Err(error.unwrap_or_else(|| format!("Upscale worker exited: {status}")));
        }
        cleanup.complete = true;
        let mut saved_path = output.clone();
        let mut export_error: Option<String> = None;
        if let Some(directory) = destination {
            let target = PathBuf::from(directory).join(format!("{id}.png"));
            match copy_output(&output, &target) {
                Ok(()) => saved_path = target,
                Err(error) => export_error = Some(error.to_string()),
            }
        }
        let mut gallery_error = None;
        let mut gallery = if save_to_gallery {
            match save_output_asset(
                &store, &output, &id,
                &model_id,
            ) {
                Ok(entry) => Some(entry),
                Err(error) => { gallery_error = Some(error); None }
            }
        } else {
            None
        };
        if let Some(entry) = gallery.as_mut() {
            entry["provenance"] = json!({"kind":"upscale","model":model_id});
            let asset_id = entry["asset"]["id"].as_str().ok_or("Missing saved asset")?;
            store.db.lock().map_err(|e| e.to_string())?.execute(
                "UPDATE records SET body=?1 WHERE collection='gallery' AND id=?2",
                rusqlite::params![entry.to_string(),asset_id],
            ).map_err(|e|e.to_string())?;
        }
        Ok(json!({"jobId":id,"path":output,"exportedPath":saved_path,"gallery":gallery,"exportError":export_error,"galleryError":gallery_error}))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn upscale_save(store: tauri::State<Store>, path: String, model_id: Option<String>) -> Result<Value, String> {
    let source = PathBuf::from(path).canonicalize().map_err(|e| e.to_string())?;
    let staging = store
        .root
        .join("upscale-session")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !source.starts_with(staging) || source.extension().and_then(|v| v.to_str()) != Some("png") {
        return Err("Unknown upscale output".into());
    }
    let id = source
        .file_stem()
        .and_then(|v| v.to_str())
        .ok_or("Invalid upscale output")?;
    uuid::Uuid::parse_str(id).map_err(|_| "Invalid upscale output ID")?;
    let mut entry = save_output_asset(&store, &source, id, model_id.as_deref().unwrap_or("unknown"))?;
    if let Err(error) = crate::library::auto_export(&store, &entry, "upscale") {
        entry["exportError"] = json!(error);
    }
    Ok(entry)
}

fn save_output_asset(store: &Store, source: &std::path::Path, id: &str, model_id: &str) -> Result<Value, String> {
    static SAVING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _saving = SAVING.lock().map_err(|e| e.to_string())?;
    if let Ok(entry) = assets::entry(store, id) {
        return Ok(entry);
    }
    let mut entry = assets::save_asset_with_id(
        store,
        &std::fs::read(source).map_err(|e| e.to_string())?,
        "generated",
        id.into(),
    )?;
    entry["provenance"] = json!({"kind":"upscale","model":model_id});
    store
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute(
            "UPDATE records SET body=?1 WHERE collection='gallery' AND id=?2",
            rusqlite::params![entry.to_string(), id],
        )
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub fn upscale_configure(state: tauri::State<Scheduler>, concurrency: usize) -> Result<(), String> {
    state.configure(concurrency)
}

#[tauri::command]
pub fn upscale_cancel(state: tauri::State<Scheduler>, id: String) -> Result<bool, String> {
    state.cancel(&id)
}

#[tauri::command]
pub fn upscale_jobs(state: tauri::State<Scheduler>) -> Result<Value, String> {
    Ok(Value::Array(
        state
            .snapshot()?
            .into_iter()
            .map(|job| {
                json!({
                    "jobId": job.id,
                    "state": job.state,
                    "assetId": job.asset_id,
                    "modelId": job.model_id,
                    "scale": job.scale,
                })
            })
            .collect(),
    ))
}

pub fn run_device_probe(path: &str) {
    let result = devices::enumerate(std::path::Path::new(path));
    match result {
        Ok(devices) => println!("{}", json!({"devices":devices})),
        Err(error) => println!("{}", json!({"error":error})),
    }
    use std::io::Write;
    let _ = std::io::stdout().flush();
    worker::exit_worker(0)
}

#[tauri::command]
pub async fn upscale_devices(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || probe_devices(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn probe_devices(app: &tauri::AppHandle) -> Result<Vec<Value>, String> {
    use std::io::Read;
    let path = runtime_path(&resources(app)?)?;
    let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
    command
        .arg("--upscale-devices")
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let started = std::time::Instant::now();
    while child.try_wait().map_err(|e| e.to_string())?.is_none() {
        if started.elapsed() > std::time::Duration::from_secs(15) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Device enumeration timed out".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }
    let mut body = String::new();
    child
        .stdout
        .take()
        .ok_or("Device probe output unavailable")?
        .read_to_string(&mut body)
        .map_err(|e| e.to_string())?;
    let value: Value = body
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str(line).ok())
        .ok_or("Device probe did not respond")?;
    if let Some(error) = value["error"].as_str() {
        return Err(error.into());
    }
    Ok(value["devices"].as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub fn upscale_export(
    store: tauri::State<Store>,
    path: String,
    directory: String,
    job_id: String,
) -> Result<String, String> {
    uuid::Uuid::parse_str(&job_id).map_err(|_| "Invalid upscale job ID")?;
    let source = PathBuf::from(path).canonicalize().map_err(|e| e.to_string())?;
    let _mutation = store.library_mutation.lock().map_err(|e| e.to_string())?;
    let staging = store
        .root
        .join("upscale-session")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !source.starts_with(staging)
        || source.file_name().and_then(|v| v.to_str()) != Some(format!("{job_id}.png").as_str())
    {
        return Err("Unknown upscale output".into());
    }
    let destination = PathBuf::from(directory).join(format!("{job_id}.png"));
    copy_output(&source, &destination)?;
    Ok(destination.to_string_lossy().into_owned())
}

fn copy_output(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    if target.exists() {
        if std::fs::read(source).map_err(|e| e.to_string())? == std::fs::read(target).map_err(|e| e.to_string())? {
            return Ok(());
        }
        return Err("Output file already exists".into());
    }
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|e| e.to_string())?;
    if let Err(error) = std::fs::File::open(source).and_then(|mut input| std::io::copy(&mut input, &mut output)) {
        drop(output);
        let _ = std::fs::remove_file(target);
        return Err(error.to_string());
    }
    Ok(())
}
