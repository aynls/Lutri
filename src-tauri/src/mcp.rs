use axum::{
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

pub struct Bridge {
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    tools: Mutex<Vec<Value>>,
    server: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    token: Mutex<String>,
}
impl Bridge {
    pub fn new() -> Result<Self, String> {
        let entry = keyring::Entry::new("app.lutri.studio", "mcp").map_err(|e| e.to_string())?;
        let token = match entry.get_password() {
            Ok(token) => token,
            Err(keyring::Error::NoEntry) => {
                let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
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
async fn handle(State(state): State<ServerState>, headers: HeaderMap, Json(message): Json<Value>) -> Response {
    let auth = headers.get("authorization").and_then(|v| v.to_str().ok());
    let token = state.bridge.token.lock().unwrap().clone();
    if auth != Some(format!("Bearer {token}").as_str()) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if let Some(origin) = headers.get("origin") {
        let allowed = format!("http://127.0.0.1:{}", state.port);
        if origin.to_str().ok() != Some(allowed.as_str()) {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    if let Some(version) = headers.get("mcp-protocol-version") {
        if !matches!(version.to_str().ok(), Some("2025-03-26" | "2025-06-18")) {
            return StatusCode::BAD_REQUEST.into_response();
        }
    }
    let id = message.get("id").cloned();
    let method = message["method"].as_str().unwrap_or("");
    if id.is_none() {
        return StatusCode::ACCEPTED.into_response();
    }
    let id = id.unwrap();
    let result = match method {
        "initialize" => {
            json!({"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"lutri","version":"0.2.0"}})
        }
        "ping" => json!({}),
        "tools/list" => json!({"tools":state.bridge.tools.lock().unwrap().clone()}),
        "tools/call" => {
            let request_id = uuid::Uuid::new_v4().to_string();
            let (sender, receiver) = oneshot::channel();
            state.bridge.pending.lock().unwrap().insert(request_id.clone(), sender);
            if let Err(error) = state.app.emit_to(
                "main",
                "mcp-request",
                json!({"id":request_id,"name":message["params"]["name"],"arguments":message["params"]["arguments"]}),
            ) {
                state.bridge.pending.lock().unwrap().remove(&request_id);
                return Json(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32603,"message":error.to_string()}}))
                    .into_response();
            }
            let response = tokio::time::timeout(std::time::Duration::from_secs(1800), receiver).await;
            state.bridge.pending.lock().unwrap().remove(&request_id);
            match response {
                Ok(Ok(value)) => value,
                _ => {
                    json!({"isError":true,"content":[{"type":"text","text":"Lutri did not respond. Check existing tasks before resubmitting."}]})
                }
            }
        }
        _ => {
            return Json(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Method not found"}}))
                .into_response()
        }
    };
    Json(json!({"jsonrpc":"2.0","id":id,"result":result})).into_response()
}

#[tauri::command]
pub async fn mcp_start(app: tauri::AppHandle, port: u16, tools: Vec<Value>) -> Result<Value, String> {
    if port < 1024 {
        return Err("Port must be at least 1024".into());
    }
    let bridge = app.state::<Arc<Bridge>>().inner().clone();
    *bridge.tools.lock().map_err(|e| e.to_string())? = tools;
    if bridge.server.lock().map_err(|e| e.to_string())?.is_some() {
        return Err("MCP is already running".into());
    }
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|e| e.to_string())?;
    let state = ServerState {
        app,
        bridge: bridge.clone(),
        port,
    };
    let router = Router::new()
        .route("/mcp", post(handle))
        .layer(DefaultBodyLimit::max(16 * 1024 * 1024))
        .with_state(state);
    let server = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    *bridge.server.lock().map_err(|e| e.to_string())? = Some(server);
    Ok(
        json!({"url":format!("http://127.0.0.1:{port}/mcp"),"token":bridge.token.lock().map_err(|e| e.to_string())?.clone()}),
    )
}

#[tauri::command]
pub fn mcp_stop(bridge: tauri::State<Arc<Bridge>>) -> Result<(), String> {
    if let Some(server) = bridge.server.lock().map_err(|e| e.to_string())?.take() {
        server.abort();
    }
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
pub fn mcp_rotate_token(bridge: tauri::State<Arc<Bridge>>) -> Result<String, String> {
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    keyring::Entry::new("app.lutri.studio", "mcp")
        .map_err(|e| e.to_string())?
        .set_password(&token)
        .map_err(|e| e.to_string())?;
    *bridge.token.lock().map_err(|e| e.to_string())? = token.clone();
    Ok(token)
}
