use super::{dispatch, Service, MAX_REQUEST_BYTES, PROTOCOLS};
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Request, State},
    http::{
        header::{HOST, ORIGIN},
        HeaderMap, StatusCode,
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use std::sync::Mutex;
use tauri::Emitter;
use tokio::sync::watch;

#[derive(Default)]
pub(super) struct Server(Mutex<Option<Running>>);

struct Running {
    id: uuid::Uuid,
    port: u16,
    stop: watch::Sender<()>,
}

#[derive(Clone)]
struct HttpState {
    service: Service,
    stop: watch::Receiver<()>,
}

async fn validate_local_request(State(port): State<u16>, request: Request, next: Next) -> Response {
    let allowed_hosts = [format!("127.0.0.1:{port}"), format!("localhost:{port}")];
    let is_local = |host: &str| allowed_hosts.iter().any(|allowed| host.eq_ignore_ascii_case(allowed));
    let mut hosts = request.headers().get_all(HOST).iter();
    let host = hosts.next().and_then(|value| value.to_str().ok());
    if !host.is_some_and(is_local)
        || hosts.next().is_some()
        || request
            .uri()
            .authority()
            .is_some_and(|authority| !is_local(authority.as_str()))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut origins = request.headers().get_all(ORIGIN).iter();
    if let Some(origin) = origins.next() {
        let origin_host = origin.to_str().ok().and_then(|origin| origin.strip_prefix("http://"));
        if !origin_host.is_some_and(is_local) || origins.next().is_some() {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    next.run(request).await
}

async fn handle(State(mut state): State<HttpState>, headers: HeaderMap, body: Bytes) -> Response {
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
    tokio::select! {
        biased;
        _ = state.stop.changed() => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        reply = dispatch(&state.service, &body) => match reply {
            Some(reply) => Json(reply).into_response(),
            None => StatusCode::ACCEPTED.into_response(),
        },
    }
}

impl Server {
    pub(super) fn start(&self, service: Service, port: u16) -> Result<(), String> {
        if port < 1024 {
            return Err("Port must be at least 1024".into());
        }
        let mut running = self.0.lock().map_err(|error| error.to_string())?;
        if let Some(server) = running.as_ref() {
            return if server.port == port {
                Ok(())
            } else {
                Err("Stop HTTP before changing its port".into())
            };
        }

        let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
            .map_err(|error| error.to_string())?;
        listener.set_nonblocking(true).map_err(|error| error.to_string())?;
        let listener = tokio::net::TcpListener::from_std(listener).map_err(|error| error.to_string())?;
        let (stop, mut stopped) = watch::channel(());
        let state = HttpState { service: service.clone(), stop: stopped.clone() };
        let router = Router::new()
            .route("/mcp", post(handle))
            .layer(DefaultBodyLimit::max(MAX_REQUEST_BYTES))
            .route_layer(middleware::from_fn_with_state(port, validate_local_request))
            .with_state(state);
        let id = uuid::Uuid::new_v4();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = axum::serve(listener, router)
                .with_graceful_shutdown(async move { let _ = stopped.changed().await; })
                .await
            {
                eprintln!("MCP HTTP listener stopped: {error}");
            }
            if let Ok(mut running) = service.bridge.http.0.lock() {
                if running.as_ref().is_some_and(|server| server.id == id) {
                    *running = None;
                }
            }
            let _ = service.app.emit_to("main", "mcp-status-changed", ());
        });
        *running = Some(Running { id, port, stop });
        Ok(())
    }

    pub(super) fn url(&self) -> Result<Option<String>, String> {
        let running = self.0.lock().map_err(|error| error.to_string())?;
        Ok(running.as_ref().map(|server| format!("http://127.0.0.1:{}/mcp", server.port)))
    }

    pub(super) fn stop(&self) -> Result<(), String> {
        if let Some(server) = self.0.lock().map_err(|error| error.to_string())?.take() {
            let _ = server.stop.send(());
        }
        Ok(())
    }
}
