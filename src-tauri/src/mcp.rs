use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
use tokio::sync::oneshot;

const PROTOCOLS: &[&str] = &["2025-06-18", "2025-11-25"];
const INSTRUCTIONS: &str = "Lutri exposes creation, gallery lookup and saved task results. Start with list_models and get_model. Use validate_creation before submitting. Generate and submit_batch return durable batch/task IDs; query list_tasks/get_task/get_batch for results. Retry a lost submission with the same requestId and identical arguments. Find previous results with list_tasks (all origins by default); status=completed, orderBy=updatedAt, limit=1 selects the most recently completed task. get_image accepts saved results outside the gallery. User drafts are independent. Upscaling is not exposed.";

struct Server {
    id: String,
    port: u16,
    task: tauri::async_runtime::JoinHandle<()>,
}

pub struct Bridge {
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    tools: Mutex<Vec<Value>>,
    server: Mutex<Option<Server>>,
    token: Mutex<String>,
}

fn new_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

impl Bridge {
    pub fn new() -> Result<Self, String> {
        let entry = keyring::Entry::new("app.lutri.studio", "mcp").map_err(|e| e.to_string())?;
        let token = match entry.get_password() {
            Ok(token) => token,
            Err(keyring::Error::NoEntry) => {
                let token = new_token();
                entry.set_password(&token).map_err(|e| e.to_string())?;
                token
            }
            Err(error) => return Err(error.to_string()),
        };
        Ok(Self {
            pending: Mutex::new(HashMap::new()),
            tools: Mutex::new(vec![]),
            server: Mutex::new(None),
            token: Mutex::new(token),
        })
    }
}

#[derive(Clone)]
struct ServerState {
    app: tauri::AppHandle,
    bridge: Arc<Bridge>,
    port: u16,
}

// Also remove pending senders when an HTTP client disconnects or the server stops.
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

fn rpc_error(id: Value, code: i32, message: &str) -> Response {
    Json(json!({"jsonrpc":"2.0", "id":id, "error":{"code":code,"message":message}})).into_response()
}

async fn handle(State(state): State<ServerState>, headers: HeaderMap, body: Bytes) -> Response {
    let Ok(token) = state.bridge.token.lock().map(|token| token.clone()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if headers.get("authorization").and_then(|value| value.to_str().ok()) != Some(format!("Bearer {token}").as_str()) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if let Some(origin) = headers.get("origin") {
        let allowed = [
            format!("http://127.0.0.1:{}", state.port),
            format!("http://localhost:{}", state.port),
        ];
        if !allowed.iter().any(|value| origin.to_str().ok() == Some(value.as_str())) {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    if let Some(version) = headers.get("mcp-protocol-version") {
        if !version
            .to_str()
            .ok()
            .is_some_and(|version| PROTOCOLS.contains(&version))
        {
            return StatusCode::BAD_REQUEST.into_response();
        }
    }
    let accepts = headers
        .get("accept")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let media_types: Vec<_> = accepts
        .split(',')
        .map(|value| value.split(';').next().unwrap_or("").trim())
        .collect();
    if !media_types.contains(&"application/json") || !media_types.contains(&"text/event-stream") {
        return StatusCode::NOT_ACCEPTABLE.into_response();
    }
    let message: Value = match serde_json::from_slice(&body) {
        Ok(message) => message,
        Err(_) => return rpc_error(Value::Null, -32700, "Parse error"),
    };
    if !message.is_object()
        || message["jsonrpc"] != "2.0"
        || !message["method"].is_string()
        || message.get("params").is_some_and(|params| !params.is_object())
    {
        return rpc_error(Value::Null, -32600, "Invalid JSON-RPC request");
    }
    let method = message["method"].as_str().unwrap();
    let Some(id) = message.get("id").cloned() else {
        return if method.starts_with("notifications/") {
            StatusCode::ACCEPTED.into_response()
        } else {
            rpc_error(Value::Null, -32600, "A request ID is required")
        };
    };
    if !id.is_string() && !id.is_i64() && !id.is_u64() {
        return rpc_error(Value::Null, -32600, "Invalid request ID");
    }
    let params = &message["params"];
    let result = match method {
        "initialize" => {
            let Some(requested) = params["protocolVersion"].as_str() else {
                return rpc_error(id, -32602, "protocolVersion is required");
            };
            if !params["capabilities"].is_object()
                || !params["clientInfo"]["name"].is_string()
                || !params["clientInfo"]["version"].is_string()
            {
                return rpc_error(id, -32602, "capabilities and clientInfo are required");
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
                return rpc_error(id, -32602, "This tool list has no pagination cursor");
            }
            let Ok(tools) = state.bridge.tools.lock().map(|tools| tools.clone()) else {
                return rpc_error(id, -32603, "Tool registry unavailable");
            };
            json!({"tools":tools})
        }
        "tools/call" => {
            let Some(name) = params["name"].as_str() else {
                return rpc_error(id, -32602, "Tool name is required");
            };
            let known = state
                .bridge
                .tools
                .lock()
                .map(|tools| tools.iter().any(|tool| tool["name"] == name))
                .unwrap_or(false);
            if !known {
                return rpc_error(id, -32602, "Unknown tool");
            }
            let arguments = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            if !arguments.is_object() {
                return rpc_error(id, -32602, "Tool arguments must be an object");
            }
            let request_id = uuid::Uuid::new_v4().to_string();
            let (sender, receiver) = oneshot::channel();
            {
                let Ok(mut pending) = state.bridge.pending.lock() else {
                    return rpc_error(id, -32603, "Request bridge unavailable");
                };
                if pending.len() >= 128 {
                    return rpc_error(id, -32000, "Too many pending tool calls");
                }
                pending.insert(request_id.clone(), sender);
            }
            let _pending = PendingReply {
                bridge: state.bridge.clone(),
                id: request_id.clone(),
            };
            if state
                .app
                .emit_to(
                    "main",
                    "mcp-request",
                    json!({"id":request_id,"name":name,"arguments":arguments}),
                )
                .is_err()
            {
                return rpc_error(id, -32603, "Lutri's main window is unavailable");
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
        _ => return rpc_error(id, -32601, "Method not found"),
    };
    Json(json!({"jsonrpc":"2.0","id":id,"result":result})).into_response()
}

#[tauri::command]
pub async fn mcp_start(app: tauri::AppHandle, port: u16, tools: Vec<Value>) -> Result<Value, String> {
    if port < 1024 {
        return Err("Port must be at least 1024".into());
    }
    if app.get_webview_window("main").is_none() {
        return Err("The main window is unavailable".into());
    }
    let mut names = std::collections::HashSet::new();
    for tool in &tools {
        let name = tool["name"].as_str().ok_or("Invalid tool name")?;
        if !names.insert(name) || tool["inputSchema"]["type"] != "object" {
            return Err("Invalid tool registry".into());
        }
    }
    let bridge = app.state::<Arc<Bridge>>().inner().clone();
    let mut server = bridge.server.lock().map_err(|e| e.to_string())?;
    if let Some(running) = server.as_ref() {
        if running.port != port {
            return Err("Stop MCP before changing its port".into());
        }
        *bridge.tools.lock().map_err(|e| e.to_string())? = tools;
        return Ok(
            json!({"url":format!("http://127.0.0.1:{port}/mcp"),"token":bridge.token.lock().map_err(|e|e.to_string())?.clone()}),
        );
    }
    let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let listener = tokio::net::TcpListener::from_std(listener).map_err(|e| e.to_string())?;
    *bridge.tools.lock().map_err(|e| e.to_string())? = tools;
    let state = ServerState {
        app: app.clone(),
        bridge: bridge.clone(),
        port,
    };
    let router = Router::new()
        .route("/mcp", post(handle))
        .layer(DefaultBodyLimit::max(16 * 1024 * 1024))
        .with_state(state);
    let server_id = uuid::Uuid::new_v4().to_string();
    let running_id = server_id.clone();
    let running_bridge = bridge.clone();
    let running_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("MCP listener stopped: {error}");
        }
        if let Ok(mut server) = running_bridge.server.lock() {
            if server.as_ref().is_some_and(|server| server.id == running_id) {
                *server = None;
            }
        }
        let _ = running_app.emit_to("main", "mcp-status-changed", ());
    });
    *server = Some(Server {
        id: server_id,
        port,
        task,
    });
    let token = bridge.token.lock().map_err(|e| e.to_string())?.clone();
    Ok(json!({"url":format!("http://127.0.0.1:{port}/mcp"),"token":token}))
}

#[tauri::command]
pub fn mcp_status(bridge: tauri::State<Arc<Bridge>>) -> Result<Value, String> {
    let url = bridge
        .server
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .map(|server| format!("http://127.0.0.1:{}/mcp", server.port));
    Ok(json!({"url":url,"token":bridge.token.lock().map_err(|e|e.to_string())?.clone()}))
}

#[tauri::command]
pub fn mcp_stop(app: tauri::AppHandle, bridge: tauri::State<Arc<Bridge>>) -> Result<(), String> {
    if let Some(server) = bridge.server.lock().map_err(|e| e.to_string())?.take() {
        server.task.abort();
    }
    bridge.pending.lock().map_err(|e| e.to_string())?.clear();
    let _ = app.emit_to("main", "mcp-status-changed", ());
    Ok(())
}

#[tauri::command]
pub fn mcp_reply(bridge: tauri::State<Arc<Bridge>>, id: String, result: Value) -> Result<(), String> {
    if let Some(sender) = bridge.pending.lock().map_err(|e| e.to_string())?.remove(&id) {
        let _ = sender.send(result);
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_get_token(bridge: tauri::State<Arc<Bridge>>) -> Result<String, String> {
    Ok(bridge.token.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn mcp_rotate_token(app: tauri::AppHandle, bridge: tauri::State<Arc<Bridge>>) -> Result<String, String> {
    let token = new_token();
    keyring::Entry::new("app.lutri.studio", "mcp")
        .map_err(|e| e.to_string())?
        .set_password(&token)
        .map_err(|e| e.to_string())?;
    *bridge.token.lock().map_err(|e| e.to_string())? = token.clone();
    let _ = app.emit_to("main", "mcp-status-changed", ());
    Ok(token)
}
