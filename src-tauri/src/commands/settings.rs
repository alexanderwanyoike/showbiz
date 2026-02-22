use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct ApiKeyStatus {
    pub provider: String,
    pub name: String,
    pub is_configured: bool,
    pub source: Option<String>,
}

#[tauri::command]
pub fn get_api_key(
    provider: String,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let db_key = format!("{}_api_key", provider);

    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![db_key],
            |row| row.get(0),
        )
        .ok();

    // In Tauri, we check DB only (env vars are handled differently)
    // But we can also check env vars as a fallback
    if value.is_some() {
        return Ok(value);
    }

    // Fallback to environment variable
    let env_var = match provider.as_str() {
        "gemini" => "GEMINI_API_KEY",
        "ltx" => "LTX_API_KEY",
        _ => return Ok(None),
    };

    Ok(std::env::var(env_var).ok())
}

#[tauri::command]
pub fn get_api_key_status(state: State<'_, DbState>) -> Result<Vec<ApiKeyStatus>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let providers = vec![
        ("gemini", "Google AI (Gemini)", "GEMINI_API_KEY"),
        ("ltx", "LTX Video", "LTX_API_KEY"),
    ];

    let mut statuses = Vec::new();

    for (provider, name, env_var) in providers {
        let db_key = format!("{}_api_key", provider);

        let db_value: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![db_key],
                |row| row.get(0),
            )
            .ok();

        let (is_configured, source) = if db_value.is_some() {
            (true, Some("database".to_string()))
        } else if std::env::var(env_var).is_ok() {
            (true, Some("environment".to_string()))
        } else {
            (false, None)
        };

        statuses.push(ApiKeyStatus {
            provider: provider.to_string(),
            name: name.to_string(),
            is_configured,
            source,
        });
    }

    Ok(statuses)
}

#[tauri::command]
pub fn save_api_key(
    provider: String,
    api_key: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let db_key = format!("{}_api_key", provider);

    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
        params![db_key, trimmed],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_api_key(
    provider: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let db_key = format!("{}_api_key", provider);

    conn.execute("DELETE FROM settings WHERE key = ?1", params![db_key])
        .map_err(|e| e.to_string())?;

    Ok(())
}
