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

    Ok(value)
}

#[tauri::command]
pub fn get_api_key_status(state: State<'_, DbState>) -> Result<Vec<ApiKeyStatus>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let providers = vec![
        ("gemini", "Google AI (Gemini)"),
        ("ltx", "LTX Video"),
        ("kie", "Kie AI"),
        ("fal", "fal.ai"),
        ("replicate", "Replicate"),
    ];

    let mut statuses = Vec::new();

    for (provider, name) in providers {
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

#[cfg(test)]
mod tests {
    use rusqlite::params;

    #[test]
    fn save_and_retrieve_api_key() {
        let conn = crate::db::tests::open_test_db();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params!["gemini_api_key", "test-key-123"],
        ).unwrap();
        let value: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["gemini_api_key"],
            |row| row.get(0),
        ).ok();
        assert_eq!(value, Some("test-key-123".to_string()));
    }

    #[test]
    fn save_overrides_existing_key() {
        let conn = crate::db::tests::open_test_db();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params!["gemini_api_key", "old-key"],
        ).unwrap();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
            params!["gemini_api_key", "new-key"],
        ).unwrap();
        let value: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["gemini_api_key"],
            |row| row.get(0),
        ).ok();
        assert_eq!(value, Some("new-key".to_string()));
    }

    #[test]
    fn get_missing_key_returns_none() {
        let conn = crate::db::tests::open_test_db();
        let value: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["gemini_api_key"],
            |row| row.get(0),
        ).ok();
        assert_eq!(value, None);
    }

    #[test]
    fn delete_api_key() {
        let conn = crate::db::tests::open_test_db();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params!["gemini_api_key", "to-delete"],
        ).unwrap();
        conn.execute("DELETE FROM settings WHERE key = ?1", params!["gemini_api_key"]).unwrap();
        let value: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["gemini_api_key"],
            |row| row.get(0),
        ).ok();
        assert_eq!(value, None);
    }

    #[test]
    fn save_trims_whitespace() {
        let conn = crate::db::tests::open_test_db();
        let raw = "  trimmed-key  ";
        let trimmed = raw.trim();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params!["gemini_api_key", trimmed],
        ).unwrap();
        let value: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["gemini_api_key"],
            |row| row.get(0),
        ).ok();
        assert_eq!(value, Some("trimmed-key".to_string()));
    }

    #[test]
    fn multiple_providers_independent() {
        let conn = crate::db::tests::open_test_db();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params!["gemini_api_key", "gemini-key"],
        ).unwrap();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params!["ltx_api_key", "ltx-key"],
        ).unwrap();

        let gemini: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["gemini_api_key"],
            |row| row.get(0),
        ).ok();
        let ltx: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params!["ltx_api_key"],
            |row| row.get(0),
        ).ok();

        assert_eq!(gemini, Some("gemini-key".to_string()));
        assert_eq!(ltx, Some("ltx-key".to_string()));
    }
}
