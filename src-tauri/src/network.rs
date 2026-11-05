use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::ipc::Channel;

fn credential(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.lutri.studio", provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credential_save(provider: String, secret: String) -> Result<(), String> {
    credential(&provider)?.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credential_present(provider: String) -> Result<bool, String> {
    match credential(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn credential_remove(provider: String) -> Result<(), String> {
    match credential(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub provider: String,
    pub auth_header: String,
    pub auth_prefix: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<Value>,
    pub multipart: Option<Vec<MultipartPart>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartPart {
    name: String,
    text: Option<String>,
    data_url: Option<String>,
    file_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    status: u16,
    body: String,
    retry_after: Option<String>,
}

fn prepare(request: HttpRequest) -> Result<reqwest::RequestBuilder, String> {
    let secret = credential(&request.provider)?
        .get_password()
        .map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(1800))
        .build()
        .map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client
        .request(method, request.url)
        .header(request.auth_header, format!("{}{}", request.auth_prefix, secret));
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    if let Some(parts) = request.multipart {
        let mut form = reqwest::multipart::Form::new();
        for part in parts {
            if let Some(data) = part.data_url {
                let mime = data
                    .strip_prefix("data:")
                    .and_then(|v| v.split_once(';'))
                    .map(|v| v.0)
                    .ok_or("Invalid media type")?;
                let file = reqwest::multipart::Part::bytes(crate::assets::decode_data_url(&data)?)
                    .file_name(part.file_name.unwrap_or_else(|| "image.png".into()))
                    .mime_str(mime)
                    .map_err(|e| e.to_string())?;
                form = form.part(part.name, file);
            } else if let Some(text) = part.text {
                form = form.text(part.name, text);
            }
        }
        builder = builder.multipart(form);
    } else if let Some(body) = request.body {
        builder = builder.json(&body);
    }
    Ok(builder)
}

#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let response = prepare(request)?.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(HttpResponse {
        status,
        body,
        retry_after,
    })
}

#[tauri::command]
pub async fn http_stream(request: HttpRequest, channel: Channel<Vec<u8>>) -> Result<(), String> {
    let response = prepare(request)?.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        return Err(format!(
            "{}: {}",
            status,
            response.text().await.map_err(|e| e.to_string())?
        ));
    }
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        channel
            .send(chunk.map_err(|e| e.to_string())?.to_vec())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
