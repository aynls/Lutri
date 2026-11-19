mod http;
pub(crate) mod stdio;

use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
use tokio::sync::oneshot;

const PROTOCOLS: &[&str] = &["2025-06-18", "2025-11-25"];
const INSTRUCTIONS: &str = "Lutri exposes creation, gallery lookup and saved task results. Start with list_models and get_model. Use validate_creation before submitting. The generate tool returns batchId and taskIds. The submit_batch tool returns batchId and taskCount. Use get_task for individual results, get_batch for batch progress and list_tasks with batchId to page through batch results. Retry a lost submission with the same requestId and identical arguments. To find the latest completed task across all origins, use list_tasks with status=completed, orderBy=updatedAt and limit=1. get_image accepts saved results outside the gallery. User drafts are independent. Upscaling is not exposed.";
const MAX_REQUEST_BYTES: usize = 16 * 1024 * 1024;
const MAX_PENDING_CALLS: usize = 128;

#[derive(Default)]
pub struct Bridge {
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    tools: Mutex<Option<Vec<Value>>>,
    http: http::Server,
    stdio: stdio::Server,
}

#[derive(Clone)]
struct Service {
    app: tauri::AppHandle,
    bridge: Arc<Bridge>,
}

impl Service {
    fn new(app: tauri::AppHandle) -> Result<Self, String> {
        let bridge = app.state::<Arc<Bridge>>().inner().clone();
        if bridge.tools.lock().map_err(|error| error.to_string())?.is_none() {
            return Err("Lutri's MCP tools are still loading".into());
        }
        Ok(Self { app, bridge })
    }
}

struct PendingReply {
    bridge: Arc<Bridge>,
    id: String,
}

impl Drop for PendingReply {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.bridge.pending.lock() {
            pending.remove(&self.id);
        }
    }
}

fn rpc_error(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0", "id":id, "error":{"code":code,"message":message}})
}

async fn dispatch(service: &Service, body: &[u8]) -> Option<Value> {
    let message: Value = match serde_json::from_slice(body) {
        Ok(message) => message,
        Err(_) => return Some(rpc_error(Value::Null, -32700, "Parse error")),
    };
    if !message.is_object()
        || message["jsonrpc"] != "2.0"
        || !message["method"].is_string()
        || message.get("params").is_some_and(|params| !params.is_object())
    {
        return Some(rpc_error(Value::Null, -32600, "Invalid JSON-RPC request"));
    }
    let method = message["method"].as_str().unwrap();
    let Some(id) = message.get("id").cloned() else {
        return if method.starts_with("notifications/") {
            None
        } else {
            Some(rpc_error(Value::Null, -32600, "A request ID is required"))
        };
    };
    if !id.is_string() && !id.is_i64() && !id.is_u64() {
        return Some(rpc_error(Value::Null, -32600, "Invalid request ID"));
    }
    let params = &message["params"];
    let result = match method {
        "initialize" => {
            let Some(requested) = params["protocolVersion"].as_str() else {
                return Some(rpc_error(id, -32602, "protocolVersion is required"));
            };
            if !params["capabilities"].is_object()
                || !params["clientInfo"]["name"].is_string()
                || !params["clientInfo"]["version"].is_string()
            {
                return Some(rpc_error(id, -32602, "capabilities and clientInfo are required"));
            }
            json!({
                "protocolVersion": if PROTOCOLS.contains(&requested) { requested } else { PROTOCOLS[PROTOCOLS.len()-1] },
                "capabilities": {"tools": {}},
                "serverInfo": {"name":"lutri", "version":env!("CARGO_PKG_VERSION")},
                "instructions": INSTRUCTIONS,
            })
        }
        "ping" => json!({}),
        "tools/list" => {
            if params.get("cursor").is_some() {
                return Some(rpc_error(id, -32602, "This tool list has no pagination cursor"));
            }
            let Ok(tools) = service.bridge.tools.lock().map(|tools| tools.clone().unwrap_or_default()) else {
                return Some(rpc_error(id, -32603, "Tool registry unavailable"));
            };
            json!({"tools":tools})
        }
        "tools/call" => {
            let Some(name) = params["name"].as_str() else {
                return Some(rpc_error(id, -32602, "Tool name is required"));
            };
            let known = service
                .bridge
                .tools
                .lock()
                .map(|tools| tools.as_ref().is_some_and(|tools| tools.iter().any(|tool| tool["name"] == name)))
                .unwrap_or(false);
            if !known {
                return Some(rpc_error(id, -32602, "Unknown tool"));
            }
            let arguments = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            if !arguments.is_object() {
                return Some(rpc_error(id, -32602, "Tool arguments must be an object"));
            }
            let request_id = uuid::Uuid::new_v4().to_string();
            let (sender, receiver) = oneshot::channel();
            {
                let Ok(mut pending) = service.bridge.pending.lock() else {
                    return Some(rpc_error(id, -32603, "Request bridge unavailable"));
                };
                if pending.len() >= MAX_PENDING_CALLS {
                    return Some(rpc_error(id, -32000, "Too many pending tool calls"));
                }
                pending.insert(request_id.clone(), sender);
            }
            let _pending = PendingReply {
                bridge: service.bridge.clone(),
                id: request_id.clone(),
            };
            if service
                .app
                .emit_to(
                    "main",
                    "mcp-request",
                    json!({"id":request_id,"name":name,"arguments":arguments}),
                )
                .is_err()
            {
                return Some(rpc_error(id, -32603, "Lutri's main window is unavailable"));
            }
            match tokio::time::timeout(std::time::Duration::from_secs(120), receiver).await {
                Ok(Ok(result)) => result,
                _ => {
                    let error = json!({"ok":false,"error":{
                        "code":"BRIDGE_TIMEOUT",
                        "message":"Lutri did not respond. Query existing tasks or retry the submission with its original requestId and identical input.",
                        "retryable":true
                    }});
                    json!({"isError":true,"structuredContent":error,"content":[{"type":"text","text":error.to_string()}]})
                }
            }
        }
        _ => return Some(rpc_error(id, -32601, "Method not found")),
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
}

#[tauri::command]
pub fn mcp_register(app: tauri::AppHandle, tools: Vec<Value>) -> Result<(), String> {
    if app.get_webview_window("main").is_none() {
        return Err("The main window is unavailable".into());
    }
    let mut names = HashSet::new();
    for tool in &tools {
        let name = tool["name"].as_str().ok_or("Invalid tool name")?;
        if !names.insert(name) || tool["inputSchema"]["type"] != "object" {
            return Err("Invalid tool registry".into());
        }
    }
    let bridge = app.state::<Arc<Bridge>>();
    *bridge.tools.lock().map_err(|error| error.to_string())? = Some(tools);
    Ok(())
}

#[tauri::command]
pub async fn mcp_start(app: tauri::AppHandle, port: u16) -> Result<(), String> {
    let service = Service::new(app)?;
    service.bridge.http.start(service.clone(), port)
}

#[tauri::command]
pub async fn mcp_status(bridge: tauri::State<'_, Arc<Bridge>>) -> Result<Value, String> {
    let url = bridge.http.url()?;
    let stdio_running = bridge.stdio.is_running().await;
    Ok(json!({ "url": url, "stdioRunning": stdio_running }))
}

#[tauri::command]
pub fn mcp_stop(bridge: tauri::State<'_, Arc<Bridge>>) -> Result<(), String> {
    bridge.http.stop()
}

#[tauri::command]
pub async fn mcp_set_stdio_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        let service = Service::new(app)?;
        service.bridge.stdio.start(service.clone()).await
    } else {
        stop_stdio(&app).await;
        Ok(())
    }
}

pub async fn stop_stdio(app: &tauri::AppHandle) {
    app.state::<Arc<Bridge>>().stdio.stop().await;
}

#[tauri::command]
pub fn mcp_stdio_config(app: tauri::AppHandle) -> Result<Value, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    let executable = app.env().appimage.as_ref().map(std::path::PathBuf::from).unwrap_or(executable);
    let endpoint_file = stdio::endpoint_file(&app);
    Ok(json!({
        "command": executable.to_str().ok_or("Invalid Lutri executable path")?,
        "args": ["--mcp-stdio", endpoint_file.to_str().ok_or("Invalid IPC path")?],
    }))
}

#[tauri::command]
pub fn mcp_reply(bridge: tauri::State<'_, Arc<Bridge>>, id: String, result: Value) -> Result<(), String> {
    if let Some(sender) = bridge.pending.lock().map_err(|error| error.to_string())?.remove(&id) {
        let _ = sender.send(result);
    }
    Ok(())
}
