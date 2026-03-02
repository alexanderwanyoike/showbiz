use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use tauri::State;

pub struct HttpClient(pub reqwest::Client);

#[derive(Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body_b64: String,
}

/// Make an HTTP request via a shared reqwest client, completely bypassing WebKit.
/// Returns the response body as a base64-encoded string.
#[tauri::command]
pub async fn http_request(
    client: State<'_, HttpClient>,
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let mut builder = client.0.request(method, &url);

    for (key, value) in headers {
        builder = builder.header(key, value);
    }

    if let Some(body_str) = body {
        builder = builder.body(body_str);
    }

    let response = builder.send().await.map_err(|e| {
        // Walk the full error chain for better diagnostics
        let mut msg = format!("Network error: {e}");
        let mut source = std::error::Error::source(&e);
        while let Some(s) = source {
            msg.push_str(&format!(" → {s}"));
            source = std::error::Error::source(s);
        }
        msg
    })?;

    let status = response.status().as_u16();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    Ok(HttpResponse {
        status,
        body_b64: STANDARD.encode(&bytes),
    })
}
