use crate::db::{generate_id, DbState};
use crate::media;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Clone)]
pub struct Bible {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct BibleAsset {
    pub id: String,
    pub bible_id: String,
    pub asset_type: String,
    pub name: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub tags_json: Option<String>,
    pub rules_json: Option<String>,
    pub consent_confirmed: bool,
    pub status: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct BibleAssetVariant {
    pub id: String,
    pub asset_id: String,
    pub parent_variant_id: Option<String>,
    pub name: Option<String>,
    pub status: String,
    pub media_path: Option<String>,
    pub media_url: Option<String>,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub model_id: Option<String>,
    pub source_kind: String,
    pub is_primary: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct BibleSnapshot {
    pub id: String,
    pub bible_id: String,
    pub name: String,
    pub notes: Option<String>,
    pub snapshot_json: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ShotAssetRef {
    pub id: String,
    pub shot_id: String,
    pub asset_id: String,
    pub variant_id: Option<String>,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct BibleAssetInput {
    pub asset_type: String,
    pub name: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub tags_json: Option<String>,
    pub rules_json: Option<String>,
    pub consent_confirmed: bool,
}

#[derive(Debug, Deserialize)]
pub struct BibleAssetVariantInput {
    pub parent_variant_id: Option<String>,
    pub name: Option<String>,
    pub status: Option<String>,
    pub image_base64: Option<String>,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub model_id: Option<String>,
    pub source_kind: String,
    pub is_primary: bool,
}

#[derive(Debug, Deserialize)]
pub struct ShotAssetRefInput {
    pub asset_id: String,
    pub variant_id: Option<String>,
    pub role: Option<String>,
}

fn make_media_url(app: &AppHandle, relative_path: &str) -> String {
    media::get_media_base_dir(app)
        .join(relative_path)
        .to_string_lossy()
        .into_owned()
}

fn row_to_bible(row: &rusqlite::Row<'_>) -> rusqlite::Result<Bible> {
    let is_default: i64 = row.get(4)?;
    Ok(Bible {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        is_default: is_default != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn row_to_asset(row: &rusqlite::Row<'_>) -> rusqlite::Result<BibleAsset> {
    let consent_confirmed: i64 = row.get(8)?;
    Ok(BibleAsset {
        id: row.get(0)?,
        bible_id: row.get(1)?,
        asset_type: row.get(2)?,
        name: row.get(3)?,
        summary: row.get(4)?,
        description: row.get(5)?,
        tags_json: row.get(6)?,
        rules_json: row.get(7)?,
        consent_confirmed: consent_confirmed != 0,
        status: row.get(9)?,
        sort_order: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn row_to_variant(row: &rusqlite::Row<'_>, app: &AppHandle) -> rusqlite::Result<BibleAssetVariant> {
    let media_path: Option<String> = row.get(5)?;
    let is_primary: i64 = row.get(10)?;
    let media_url = media_path.as_ref().map(|path| make_media_url(app, path));
    Ok(BibleAssetVariant {
        id: row.get(0)?,
        asset_id: row.get(1)?,
        parent_variant_id: row.get(2)?,
        name: row.get(3)?,
        status: row.get(4)?,
        media_path,
        media_url,
        prompt: row.get(6)?,
        negative_prompt: row.get(7)?,
        model_id: row.get(8)?,
        source_kind: row.get(9)?,
        is_primary: is_primary != 0,
        created_at: row.get(11)?,
    })
}

#[tauri::command]
pub fn get_bibles(project_id: String, state: State<'_, DbState>) -> Result<Vec<Bible>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, description, is_default, created_at, updated_at
             FROM bibles WHERE project_id = ?1 ORDER BY is_default DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let bibles = stmt
        .query_map(params![project_id], row_to_bible)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(bibles)
}

#[tauri::command]
pub fn create_bible(
    project_id: String,
    name: String,
    description: Option<String>,
    state: State<'_, DbState>,
) -> Result<Bible, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id("bible");
    conn.execute(
        "INSERT INTO bibles (id, project_id, name, description) VALUES (?1, ?2, ?3, ?4)",
        params![id, project_id, name, description],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, project_id, name, description, is_default, created_at, updated_at FROM bibles WHERE id = ?1",
        params![id],
        row_to_bible,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_bible(
    id: String,
    name: String,
    description: Option<String>,
    state: State<'_, DbState>,
) -> Result<Bible, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE bibles SET name = ?1, description = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![name, description, id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, project_id, name, description, is_default, created_at, updated_at FROM bibles WHERE id = ?1",
        params![id],
        row_to_bible,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_bible(
    id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    media::delete_bible_media(&app, &id);
    let changes = conn
        .execute("DELETE FROM bibles WHERE id = ?1 AND is_default = 0", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

#[tauri::command]
pub fn get_bible_assets(
    bible_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<BibleAsset>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, bible_id, asset_type, name, summary, description, tags_json, rules_json,
                    consent_confirmed, status, sort_order, created_at, updated_at
             FROM bible_assets WHERE bible_id = ?1 ORDER BY sort_order ASC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let assets = stmt
        .query_map(params![bible_id], row_to_asset)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(assets)
}

#[tauri::command]
pub fn create_bible_asset(
    bible_id: String,
    input: BibleAssetInput,
    state: State<'_, DbState>,
) -> Result<BibleAsset, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id("asset");
    conn.execute(
        "INSERT INTO bible_assets
         (id, bible_id, asset_type, name, summary, description, tags_json, rules_json, consent_confirmed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            bible_id,
            input.asset_type,
            input.name,
            input.summary,
            input.description,
            input.tags_json,
            input.rules_json,
            if input.consent_confirmed { 1 } else { 0 }
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, bible_id, asset_type, name, summary, description, tags_json, rules_json,
                consent_confirmed, status, sort_order, created_at, updated_at
         FROM bible_assets WHERE id = ?1",
        params![id],
        row_to_asset,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_bible_asset(
    id: String,
    input: BibleAssetInput,
    state: State<'_, DbState>,
) -> Result<BibleAsset, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE bible_assets
         SET asset_type = ?1, name = ?2, summary = ?3, description = ?4, tags_json = ?5,
             rules_json = ?6, consent_confirmed = ?7, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?8",
        params![
            input.asset_type,
            input.name,
            input.summary,
            input.description,
            input.tags_json,
            input.rules_json,
            if input.consent_confirmed { 1 } else { 0 },
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, bible_id, asset_type, name, summary, description, tags_json, rules_json,
                consent_confirmed, status, sort_order, created_at, updated_at
         FROM bible_assets WHERE id = ?1",
        params![id],
        row_to_asset,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_bible_asset(id: String, state: State<'_, DbState>) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let changes = conn
        .execute("DELETE FROM bible_assets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

#[tauri::command]
pub fn get_bible_asset_variants(
    asset_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<BibleAssetVariant>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, asset_id, parent_variant_id, name, status, media_path, prompt,
                    negative_prompt, model_id, source_kind, is_primary, created_at
             FROM bible_asset_variants WHERE asset_id = ?1 ORDER BY is_primary DESC, created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let variants = stmt
        .query_map(params![asset_id], |row| row_to_variant(row, &app))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(variants)
}

#[tauri::command]
pub fn create_bible_asset_variant(
    asset_id: String,
    input: BibleAssetVariantInput,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<BibleAssetVariant, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let bible_id: String = conn
        .query_row(
            "SELECT bible_id FROM bible_assets WHERE id = ?1",
            params![asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = generate_id("assetvar");
    let media_path = if let Some(image_base64) = input.image_base64.as_ref() {
        Some(media::save_bible_image(&app, &bible_id, &id, image_base64)?)
    } else {
        None
    };

    if input.is_primary {
        conn.execute(
            "UPDATE bible_asset_variants SET is_primary = 0 WHERE asset_id = ?1",
            params![asset_id],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO bible_asset_variants
         (id, asset_id, parent_variant_id, name, status, media_path, prompt, negative_prompt, model_id, source_kind, is_primary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            asset_id,
            input.parent_variant_id,
            input.name,
            input.status.unwrap_or_else(|| "candidate".to_string()),
            media_path,
            input.prompt,
            input.negative_prompt,
            input.model_id,
            input.source_kind,
            if input.is_primary { 1 } else { 0 }
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, asset_id, parent_variant_id, name, status, media_path, prompt,
                negative_prompt, model_id, source_kind, is_primary, created_at
         FROM bible_asset_variants WHERE id = ?1",
        params![id],
        |row| row_to_variant(row, &app),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_bible_asset_variant_status(
    id: String,
    status: String,
    is_primary: bool,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<BibleAssetVariant, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let asset_id: String = conn
        .query_row(
            "SELECT asset_id FROM bible_asset_variants WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if is_primary {
        conn.execute(
            "UPDATE bible_asset_variants SET is_primary = 0 WHERE asset_id = ?1",
            params![asset_id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE bible_asset_variants SET status = ?1, is_primary = ?2 WHERE id = ?3",
        params![status, if is_primary { 1 } else { 0 }, id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, asset_id, parent_variant_id, name, status, media_path, prompt,
                negative_prompt, model_id, source_kind, is_primary, created_at
         FROM bible_asset_variants WHERE id = ?1",
        params![id],
        |row| row_to_variant(row, &app),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_bible_asset_variant(
    id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let variant: Option<(String, Option<String>, bool)> = conn
        .query_row(
            "SELECT asset_id, media_path, is_primary FROM bible_asset_variants WHERE id = ?1",
            params![id],
            |row| {
                let is_primary: i64 = row.get(2)?;
                Ok((row.get(0)?, row.get(1)?, is_primary != 0))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((asset_id, media_path, was_primary)) = variant else {
        return Ok(false);
    };

    let changes = conn
        .execute("DELETE FROM bible_asset_variants WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    if changes > 0 {
        if let Some(path) = media_path {
            media::delete_media(&app, &path);
        }
        if was_primary {
            let next_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM bible_asset_variants WHERE asset_id = ?1 ORDER BY created_at DESC LIMIT 1",
                    params![asset_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(next_id) = next_id {
                conn.execute(
                    "UPDATE bible_asset_variants SET is_primary = 1, status = 'approved' WHERE id = ?1",
                    params![next_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(changes > 0)
}

#[tauri::command]
pub fn get_bible_variant_image_base64(
    variant_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let media_path: Option<String> = conn
        .query_row(
            "SELECT media_path FROM bible_asset_variants WHERE id = ?1",
            params![variant_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    match media_path {
        Some(path) => media::get_image_as_base64(&app, &path),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn get_storyboard_bibles(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<Bible>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.project_id, b.name, b.description, b.is_default, b.created_at, b.updated_at
             FROM bibles b
             JOIN storyboard_bibles sb ON sb.bible_id = b.id
             WHERE sb.storyboard_id = ?1
             ORDER BY b.is_default DESC, b.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let bibles = stmt
        .query_map(params![storyboard_id], row_to_bible)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(bibles)
}

#[tauri::command]
pub fn attach_storyboard_bible(
    storyboard_id: String,
    bible_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO storyboard_bibles (storyboard_id, bible_id) VALUES (?1, ?2)",
        params![storyboard_id, bible_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn detach_storyboard_bible(
    storyboard_id: String,
    bible_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let changes = conn
        .execute(
            "DELETE FROM storyboard_bibles WHERE storyboard_id = ?1 AND bible_id = ?2",
            params![storyboard_id, bible_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

#[tauri::command]
pub fn get_shot_asset_refs(
    shot_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<ShotAssetRef>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, shot_id, asset_id, variant_id, role, created_at
             FROM shot_asset_refs WHERE shot_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let refs = stmt
        .query_map(params![shot_id], |row| {
            Ok(ShotAssetRef {
                id: row.get(0)?,
                shot_id: row.get(1)?,
                asset_id: row.get(2)?,
                variant_id: row.get(3)?,
                role: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(refs)
}

#[tauri::command]
pub fn set_shot_asset_refs(
    shot_id: String,
    refs: Vec<ShotAssetRefInput>,
    state: State<'_, DbState>,
) -> Result<Vec<ShotAssetRef>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM shot_asset_refs WHERE shot_id = ?1", params![shot_id])
        .map_err(|e| e.to_string())?;
    for input in refs {
        conn.execute(
            "INSERT INTO shot_asset_refs (id, shot_id, asset_id, variant_id, role)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                generate_id("shotref"),
                shot_id,
                input.asset_id,
                input.variant_id,
                input.role.unwrap_or_else(|| "reference".to_string())
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    drop(conn);
    get_shot_asset_refs(shot_id, state)
}

#[tauri::command]
pub fn create_bible_snapshot(
    bible_id: String,
    name: String,
    notes: Option<String>,
    state: State<'_, DbState>,
) -> Result<BibleSnapshot, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let snapshot_json: String = conn
        .query_row(
            "SELECT json_object(
                'bible_id', ?1,
                'assets', COALESCE(json_group_array(json_object('id', id, 'type', asset_type, 'name', name)), json('[]'))
             ) FROM bible_assets WHERE bible_id = ?1",
            params![bible_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "{\"assets\":[]}".to_string());
    let id = generate_id("snapshot");
    conn.execute(
        "INSERT INTO bible_snapshots (id, bible_id, name, notes, snapshot_json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, bible_id, name, notes, snapshot_json],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, bible_id, name, notes, snapshot_json, created_at FROM bible_snapshots WHERE id = ?1",
        params![id],
        |row| {
            Ok(BibleSnapshot {
                id: row.get(0)?,
                bible_id: row.get(1)?,
                name: row.get(2)?,
                notes: row.get(3)?,
                snapshot_json: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_bible_snapshots(
    bible_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<BibleSnapshot>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, bible_id, name, notes, snapshot_json, created_at
             FROM bible_snapshots WHERE bible_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let snapshots = stmt
        .query_map(params![bible_id], |row| {
            Ok(BibleSnapshot {
                id: row.get(0)?,
                bible_id: row.get(1)?,
                name: row.get(2)?,
                notes: row.get(3)?,
                snapshot_json: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(snapshots)
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    #[test]
    fn bible_asset_and_variant_can_be_created() {
        let conn = crate::db::tests::open_test_db();
        let project_id = crate::db::generate_id("proj");
        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            params![project_id, "Series"],
        )
        .unwrap();
        let bible_id: String = conn
            .query_row(
                "SELECT id FROM bibles WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .unwrap();
        let asset_id = crate::db::generate_id("asset");
        conn.execute(
            "INSERT INTO bible_assets (id, bible_id, asset_type, name, consent_confirmed)
             VALUES (?1, ?2, 'character', 'Mara', 1)",
            params![asset_id, bible_id],
        )
        .unwrap();
        let variant_id = crate::db::generate_id("assetvar");
        conn.execute(
            "INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary)
             VALUES (?1, ?2, 'approved', 'uploaded', 1)",
            params![variant_id, asset_id],
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bible_asset_variants WHERE asset_id = ?1 AND is_primary = 1",
                params![asset_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn deleting_primary_variant_promotes_remaining_variant() {
        let conn = crate::db::tests::open_test_db();
        let project_id = crate::db::generate_id("proj");
        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            params![project_id, "Series"],
        )
        .unwrap();
        let bible_id: String = conn
            .query_row(
                "SELECT id FROM bibles WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .unwrap();
        let asset_id = crate::db::generate_id("asset");
        conn.execute(
            "INSERT INTO bible_assets (id, bible_id, asset_type, name, consent_confirmed)
             VALUES (?1, ?2, 'character', 'Mara', 1)",
            params![asset_id, bible_id],
        )
        .unwrap();
        let primary_id = crate::db::generate_id("assetvar");
        let next_id = crate::db::generate_id("assetvar");
        conn.execute(
            "INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
             VALUES (?1, ?2, 'approved', 'uploaded', 1, '2026-01-01 00:00:00')",
            params![primary_id, asset_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
             VALUES (?1, ?2, 'candidate', 'edited', 0, '2026-01-02 00:00:00')",
            params![next_id, asset_id],
        )
        .unwrap();

        let was_primary: i64 = conn
            .query_row(
                "SELECT is_primary FROM bible_asset_variants WHERE id = ?1",
                params![primary_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(was_primary, 1);

        conn.execute("DELETE FROM bible_asset_variants WHERE id = ?1", params![primary_id])
            .unwrap();
        conn.execute(
            "UPDATE bible_asset_variants
             SET is_primary = 1, status = 'approved'
             WHERE id = (
               SELECT id FROM bible_asset_variants WHERE asset_id = ?1 ORDER BY created_at DESC LIMIT 1
             )",
            params![asset_id],
        )
        .unwrap();

        let promoted: (i64, String) = conn
            .query_row(
                "SELECT is_primary, status FROM bible_asset_variants WHERE id = ?1",
                params![next_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(promoted, (1, "approved".to_string()));
    }
}
