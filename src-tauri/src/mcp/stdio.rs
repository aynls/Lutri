use super::{dispatch, Service, MAX_PENDING_CALLS, MAX_REQUEST_BYTES};
use futures_util::{stream::FuturesUnordered, StreamExt};
use std::{
    io::{self, Write},
    path::{Path, PathBuf},
};
use tauri::{Emitter, Manager};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    sync::{watch, Mutex},
    task::{JoinHandle, JoinSet},
};
use tokio_util::codec::{FramedRead, LinesCodec};

#[derive(Default)]
pub(super) struct Server(Mutex<Option<Running>>);

struct Running {
    stop: watch::Sender<()>,
    task: JoinHandle<()>,
}

pub(super) fn endpoint_file(app: &tauri::AppHandle) -> PathBuf {
    app.state::<crate::storage::Store>().root.join("mcp-stdio.endpoint")
}

struct PublishedEndpoint(PathBuf);

impl PublishedEndpoint {
    fn new(path: PathBuf, address: &str) -> io::Result<Self> {
        let directory = path.parent().ok_or_else(|| io::Error::other("Invalid IPC path"))?;
        let mut file = tempfile::NamedTempFile::new_in(directory)?;
        file.write_all(address.as_bytes())?;
        file.persist(&path).map_err(|error| error.error)?;
        Ok(Self(path))
    }
}

impl Drop for PublishedEndpoint {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

impl Server {
    pub(super) async fn start(&self, service: Service) -> Result<(), String> {
        let mut running = self.0.lock().await;
        if running.as_ref().is_some_and(|server| !server.stop.is_closed()) {
            return Ok(());
        }

        let (mut listener, address) = Listener::bind().map_err(|error| error.to_string())?;
        let endpoint = PublishedEndpoint::new(endpoint_file(&service.app), &address)
            .map_err(|error| error.to_string())?;
        let (stop, mut stopped) = watch::channel(());
        let task = tokio::spawn(async move {
            let mut connections = JoinSet::new();
            loop {
                tokio::select! {
                    biased;
                    _ = stopped.changed() => break,
                    _ = connections.join_next(), if !connections.is_empty() => {}
                    accepted = listener.accept() => match accepted {
                        Ok(stream) => {
                            connections.spawn(serve(stream, service.clone()));
                        }
                        Err(error) => {
                            eprintln!("MCP stdio listener stopped: {error}");
                            break;
                        }
                    }
                }
            }
            drop(endpoint);
            drop(listener);
            connections.shutdown().await;
            drop(stopped);
            let _ = service.app.emit_to("main", "mcp-status-changed", ());
        });
        *running = Some(Running { stop, task });
        Ok(())
    }

    pub(super) async fn stop(&self) {
        let mut running = self.0.lock().await;
        if let Some(server) = running.take() {
            let _ = server.stop.send(());
            let _ = server.task.await;
        }
    }

    pub(super) async fn is_running(&self) -> bool {
        self.0.lock().await.as_ref().is_some_and(|server| !server.stop.is_closed())
    }
}

async fn serve(stream: impl AsyncRead + AsyncWrite, service: Service) -> io::Result<()> {
    let (reader, mut writer) = tokio::io::split(stream);
    let mut messages = FramedRead::new(reader, LinesCodec::new_with_max_length(MAX_REQUEST_BYTES));
    let mut requests = FuturesUnordered::new();
    loop {
        tokio::select! {
            message = messages.next(), if requests.len() < MAX_PENDING_CALLS => {
                let Some(message) = message else {
                    return Ok(());
                };
                let line = message.map_err(io::Error::other)?;
                let service = &service;
                requests.push(async move { dispatch(service, line.as_bytes()).await });
            }
            reply = requests.next(), if !requests.is_empty() => {
                if let Some(Some(reply)) = reply {
                    let mut line = serde_json::to_vec(&reply)?;
                    line.push(b'\n');
                    writer.write_all(&line).await?;
                }
            }
        }
    }
}

#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream as LocalStream};
#[cfg(windows)]
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient as LocalStream, NamedPipeServer, ServerOptions};

#[cfg(unix)]
struct Listener {
    socket: UnixListener,
    _directory: tempfile::TempDir,
}

#[cfg(unix)]
impl Listener {
    fn bind() -> io::Result<(Self, String)> {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::Builder::new()
            .prefix("lutri-")
            .permissions(std::fs::Permissions::from_mode(0o700))
            .tempdir()?;
        let address = directory
            .path()
            .join("mcp.sock")
            .into_os_string()
            .into_string()
            .map_err(|_| io::Error::other("Invalid IPC path"))?;
        let socket = UnixListener::bind(&address)?;
        Ok((Self { socket, _directory: directory }, address))
    }

    async fn accept(&mut self) -> io::Result<LocalStream> {
        self.socket.accept().await.map(|(stream, _)| stream)
    }
}

#[cfg(windows)]
struct Listener {
    pipe: NamedPipeServer,
    address: String,
}

#[cfg(windows)]
impl Listener {
    fn bind() -> io::Result<(Self, String)> {
        let address = format!(r"\\.\pipe\lutri-mcp-{}", uuid::Uuid::new_v4());
        let pipe = ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&address)?;
        Ok((Self { pipe, address: address.clone() }, address))
    }

    async fn accept(&mut self) -> io::Result<NamedPipeServer> {
        self.pipe.connect().await?;
        let next_pipe = ServerOptions::new().reject_remote_clients(true).create(&self.address)?;
        Ok(std::mem::replace(&mut self.pipe, next_pipe))
    }
}

#[cfg(unix)]
async fn connect(address: &str) -> io::Result<LocalStream> {
    LocalStream::connect(address).await
}

#[cfg(windows)]
async fn connect(address: &str) -> io::Result<LocalStream> {
    // An incoming instance can be busy until the listener provisions the next one.
    const ERROR_PIPE_BUSY: i32 = 231;
    for _ in 0..10 {
        match ClientOptions::new().open(address) {
            Err(error) if error.raw_os_error() == Some(ERROR_PIPE_BUSY) => {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
            result => return result,
        }
    }
    ClientOptions::new().open(address)
}

pub fn run(endpoint: &Path) -> io::Result<()> {
    let address = std::fs::read_to_string(endpoint)
        .map_err(|error| io::Error::new(error.kind(), format!("Open Lutri and enable MCP stdio: {error}")))?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let result = runtime.block_on(async {
        let stream = connect(&address)
            .await
            .map_err(|error| io::Error::new(error.kind(), format!("Open Lutri and enable MCP stdio: {error}")))?;
        let (mut reader, mut writer) = tokio::io::split(stream);
        let mut stdin = tokio::io::stdin();
        let downstream = async {
            let mut stdout = tokio::io::stdout();
            let mut buffer = [0u8; 8192];
            loop {
                let size = match reader.read(&mut buffer).await {
                    Err(error) if error.kind() == io::ErrorKind::BrokenPipe => return Ok(()),
                    result => result?,
                };
                if size == 0 {
                    return Ok(());
                }
                stdout.write_all(&buffer[..size]).await?;
                stdout.flush().await?;
            }
        };
        tokio::select! {
            input = tokio::io::copy(&mut stdin, &mut writer) => input.map(|_| ()),
            output = downstream => output,
        }
    });
    // The child must exit when the desktop disconnects, even during a blocking stdin read.
    runtime.shutdown_background();
    result
}
