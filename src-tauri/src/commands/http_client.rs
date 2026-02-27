use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;

#[derive(Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body_b64: String,
}

/// Make an HTTP request via Rust/reqwest, completely bypassing WebKit.
/// Returns the response body as a base64-encoded string.
#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();

    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let mut builder = client.request(method, &url);

    for (key, value) in headers {
        builder = builder.header(key, value);
    }

    if let Some(body_str) = body {
        builder = builder.body(body_str);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

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
