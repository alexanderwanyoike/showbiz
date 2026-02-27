use crate::db::{generate_id, DbState};
use crate::media;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Clone)]
pub struct ShotWithUrls {
    pub id: String,
    pub storyboard_id: String,
    pub order: i64,
    pub duration: i64,
    pub image_prompt: Option<String>,
    pub image_path: Option<String>,
    pub video_prompt: Option<String>,
    pub video_path: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub image_url: Option<String>,
    pub video_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ShotUpdates {
    pub duration: Option<i64>,
    pub image_prompt: Option<String>,
    pub video_prompt: Option<String>,
    pub status: Option<String>,
}

/// Build an absolute file path for a media file.
/// Cache-busting timestamps are added on the TypeScript side via convertFileSrc.
fn make_media_url(app: &AppHandle, relative_path: &str) -> String {
    let base = media::get_media_base_dir(app);
    base.join(relative_path).to_string_lossy().into_owned()
}

/// Query a single shot and return it with URLs resolved.
fn query_shot_with_urls(
    conn: &rusqlite::Connection,
    app: &AppHandle,
    shot_id: &str,
) -> Result<ShotWithUrls, String> {
    let mut stmt = conn
        .prepare(
            r#"SELECT id, storyboard_id, "order", duration, image_prompt, image_path,
                      video_prompt, video_path, status, created_at, updated_at
               FROM shots WHERE id = ?1"#,
        )
        .map_err(|e| e.to_string())?;

    let shot = stmt
        .query_row(params![shot_id], |row| {
            let image_path: Option<String> = row.get(5)?;
            let video_path: Option<String> = row.get(7)?;

            let image_url = image_path.as_ref().map(|p| make_media_url(app, p));
            let video_url = video_path.as_ref().map(|p| make_media_url(app, p));

            Ok(ShotWithUrls {
                id: row.get(0)?,
                storyboard_id: row.get(1)?,
                order: row.get(2)?,
                duration: row.get(3)?,
                image_prompt: row.get(4)?,
                image_path,
                video_prompt: row.get(6)?,
                video_path,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                image_url,
                video_url,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(shot)
}

#[tauri::command]
pub fn get_shots(
    storyboard_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<ShotWithUrls>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"SELECT id, storyboard_id, "order", duration, image_prompt, image_path,
                      video_prompt, video_path, status, created_at, updated_at
               FROM shots WHERE storyboard_id = ?1 ORDER BY "order" ASC"#,
        )
        .map_err(|e| e.to_string())?;

    let shots = stmt
        .query_map(params![storyboard_id], |row| {
            let image_path: Option<String> = row.get(5)?;
            let video_path: Option<String> = row.get(7)?;

            let image_url = image_path.as_ref().map(|p| make_media_url(&app, p));
            let video_url = video_path.as_ref().map(|p| make_media_url(&app, p));

            Ok(ShotWithUrls {
                id: row.get(0)?,
                storyboard_id: row.get(1)?,
                order: row.get(2)?,
                duration: row.get(3)?,
                image_prompt: row.get(4)?,
                image_path,
                video_prompt: row.get(6)?,
                video_path,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                image_url,
                video_url,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(shots)
}

#[tauri::command]
pub fn create_shot(
    storyboard_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ShotWithUrls, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id("shot");

    // Get next order
    let next_order: i64 = conn
        .query_row(
            r#"SELECT COALESCE(MAX("order"), 0) + 1 FROM shots WHERE storyboard_id = ?1"#,
            params![storyboard_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        r#"INSERT INTO shots (id, storyboard_id, "order") VALUES (?1, ?2, ?3)"#,
        params![id, storyboard_id, next_order],
    )
    .map_err(|e| e.to_string())?;

    query_shot_with_urls(&conn, &app, &id)
}

#[tauri::command]
pub fn update_shot(
    id: String,
    updates_json: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ShotWithUrls, String> {
    let updates: ShotUpdates =
        serde_json::from_str(&updates_json).map_err(|e| format!("Invalid updates JSON: {}", e))?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut set_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(duration) = updates.duration {
        set_clauses.push("duration = ?".to_string());
        param_values.push(Box::new(duration));
    }
    if let Some(ref image_prompt) = updates.image_prompt {
        set_clauses.push("image_prompt = ?".to_string());
        param_values.push(Box::new(image_prompt.clone()));
    }
    if let Some(ref video_prompt) = updates.video_prompt {
        set_clauses.push("video_prompt = ?".to_string());
        param_values.push(Box::new(video_prompt.clone()));
    }
    if let Some(ref status) = updates.status {
        set_clauses.push("status = ?".to_string());
        param_values.push(Box::new(status.clone()));
    }

    if !set_clauses.is_empty() {
        set_clauses.push("updated_at = CURRENT_TIMESTAMP".to_string());
        param_values.push(Box::new(id.clone()));

        let sql = format!(
            "UPDATE shots SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        conn.execute(&sql, params_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    query_shot_with_urls(&conn, &app, &id)
}

#[tauri::command]
pub fn delete_shot(
    id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get shot to find media paths
    let shot_data: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT image_path, video_path FROM shots WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((image_path, video_path)) = shot_data {
        if let Some(path) = image_path {
            media::delete_media(&app, &path);
        }
        if let Some(path) = video_path {
            media::delete_media(&app, &path);
        }
    }

    // Delete version images and mask images
    media::delete_version_images(&app, &id);
    media::delete_mask_images(&app, &id);

    // Delete from DB (cascades to image_versions and timeline_edits)
    let changes = conn
        .execute("DELETE FROM shots WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

#[tauri::command]
pub fn reorder_shots(
    storyboard_id: String,
    shot_ids: Vec<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Use a savepoint for the transaction
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    for (index, shot_id) in shot_ids.iter().enumerate() {
        tx.execute(
            r#"UPDATE shots SET "order" = ?1 WHERE id = ?2 AND storyboard_id = ?3"#,
            params![index as i64 + 1, shot_id, storyboard_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_shot_image(
    id: String,
    base64_data_url: String,
    prompt: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ShotWithUrls, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get existing shot to delete old media
    let existing: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT image_path, video_path FROM shots WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((old_image, old_video)) = &existing {
        if let Some(path) = old_image {
            media::delete_media(&app, path);
        }
        if let Some(path) = old_video {
            media::delete_media(&app, path);
        }
    }

    // Save new image
    let image_path = media::save_image(&app, &id, &base64_data_url)?;

    // Update shot in DB: set image, reset video
    conn.execute(
        "UPDATE shots SET image_path = ?1, image_prompt = ?2, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![image_path, prompt, id],
    )
    .map_err(|e| e.to_string())?;

    query_shot_with_urls(&conn, &app, &id)
}

#[tauri::command]
pub fn save_shot_video(
    id: String,
    base64_data_url: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ShotWithUrls, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Delete old video if exists
    let old_video: Option<String> = conn
        .query_row(
            "SELECT video_path FROM shots WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(path) = old_video {
        media::delete_media(&app, &path);
    }

    // Save new video
    let video_path = media::save_video(&app, &id, &base64_data_url)?;

    // Update shot in DB
    conn.execute(
        "UPDATE shots SET video_path = ?1, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![video_path, id],
    )
    .map_err(|e| e.to_string())?;

    query_shot_with_urls(&conn, &app, &id)
}

#[tauri::command]
pub fn get_shot_image_base64(
    shot_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let image_path: Option<String> = conn
        .query_row(
            "SELECT image_path FROM shots WHERE id = ?1",
            params![shot_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    match image_path {
        Some(path) => media::get_image_as_base64(&app, &path),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn copy_image_from_shot(
    target_shot_id: String,
    source_shot_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ShotWithUrls, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get source shot's image
    let source: Option<(Option<String>, Option<String>, i64)> = conn
        .query_row(
            r#"SELECT image_path, image_prompt, "order" FROM shots WHERE id = ?1"#,
            params![source_shot_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    let (source_image_path, source_prompt, source_order) =
        source.ok_or("Source shot not found")?;

    let source_image_path =
        source_image_path.ok_or("Source shot has no image")?;

    // Read source image as base64
    let image_base64 = media::get_image_as_base64(&app, &source_image_path)?
        .ok_or("Failed to read source image")?;

    // Delete old media from target
    let target: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT image_path, video_path FROM shots WHERE id = ?1",
            params![target_shot_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((old_image, old_video)) = &target {
        if let Some(path) = old_image {
            media::delete_media(&app, path);
        }
        if let Some(path) = old_video {
            media::delete_media(&app, path);
        }
    }

    // Save copied image
    let image_path = media::save_image(&app, &target_shot_id, &image_base64)?;

    // Build prompt text
    let prompt_text = source_prompt
        .map(|_| format!("Copied from Shot #{}", source_order))
        .or_else(|| Some(format!("Copied from Shot #{}", source_order)));

    // Update target shot
    conn.execute(
        "UPDATE shots SET image_path = ?1, image_prompt = ?2, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![image_path, prompt_text, target_shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_shot_with_urls(&conn, &app, &target_shot_id)
}

#[tauri::command]
pub fn save_and_complete_video(
    shot_id: String,
    video_data: Vec<u8>,
    mime_type: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ShotWithUrls, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Delete old video if exists
    let old_video: Option<String> = conn
        .query_row(
            "SELECT video_path FROM shots WHERE id = ?1",
            params![shot_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(path) = old_video {
        media::delete_media(&app, &path);
    }

    // Save raw video bytes
    let video_path = media::save_video_blob(&app, &shot_id, &video_data, &mime_type)?;

    // Update shot in DB
    conn.execute(
        "UPDATE shots SET video_path = ?1, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![video_path, shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_shot_with_urls(&conn, &app, &shot_id)
}
