use crate::db::{generate_id, DbState};
use crate::media;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Clone)]
pub struct VideoVersion {
    pub id: String,
    pub shot_id: String,
    pub parent_version_id: Option<String>,
    pub version_number: i64,
    pub edit_type: String,
    pub video_path: String,
    pub prompt: Option<String>,
    pub settings_json: Option<String>,
    pub model_id: Option<String>,
    pub is_current: bool,
    pub created_at: String,
    pub video_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct VideoVersionNode {
    pub version: VideoVersion,
    pub children: Vec<VideoVersionNode>,
}

/// Build an absolute file path for a media file.
fn make_media_url(app: &AppHandle, relative_path: &str) -> String {
    let base = media::get_media_base_dir(app);
    base.join(relative_path).to_string_lossy().into_owned()
}

/// Query a single video version by ID and return it with URLs.
fn query_version(
    conn: &rusqlite::Connection,
    app: &AppHandle,
    version_id: &str,
) -> Result<Option<VideoVersion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, shot_id, parent_version_id, version_number, edit_type, video_path,
                    prompt, settings_json, model_id, is_current, created_at
             FROM video_versions WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let version = stmt
        .query_row(params![version_id], |row| {
            let video_path: String = row.get(5)?;
            let is_current_i: i64 = row.get(9)?;

            Ok(VideoVersion {
                id: row.get(0)?,
                shot_id: row.get(1)?,
                parent_version_id: row.get(2)?,
                version_number: row.get(3)?,
                edit_type: row.get(4)?,
                video_url: Some(make_media_url(app, &video_path)),
                video_path,
                prompt: row.get(6)?,
                settings_json: row.get(7)?,
                model_id: row.get(8)?,
                is_current: is_current_i != 0,
                created_at: row.get(10)?,
            })
        })
        .ok();

    Ok(version)
}

/// Get next version number for a shot.
fn get_next_version_number(conn: &rusqlite::Connection, shot_id: &str) -> Result<i64, String> {
    let max_ver: Option<i64> = conn
        .query_row(
            "SELECT MAX(version_number) FROM video_versions WHERE shot_id = ?1",
            params![shot_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    Ok(max_ver.unwrap_or(0) + 1)
}

/// Build a tree structure from a flat list of video versions.
fn build_tree(versions: Vec<VideoVersion>) -> Vec<VideoVersionNode> {
    use std::collections::HashMap;

    let mut node_map: HashMap<String, VideoVersionNode> = HashMap::new();

    for version in &versions {
        node_map.insert(
            version.id.clone(),
            VideoVersionNode {
                version: version.clone(),
                children: Vec::new(),
            },
        );
    }

    let mut children_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut root_ids: Vec<String> = Vec::new();

    for version in &versions {
        if let Some(ref parent_id) = version.parent_version_id {
            if node_map.contains_key(parent_id) {
                children_map
                    .entry(parent_id.clone())
                    .or_default()
                    .push(version.id.clone());
            } else {
                root_ids.push(version.id.clone());
            }
        } else {
            root_ids.push(version.id.clone());
        }
    }

    fn build_subtree(
        node_id: &str,
        node_map: &mut HashMap<String, VideoVersionNode>,
        children_map: &HashMap<String, Vec<String>>,
    ) -> VideoVersionNode {
        let mut node = node_map.remove(node_id).unwrap();

        if let Some(child_ids) = children_map.get(node_id) {
            for child_id in child_ids {
                let child = build_subtree(child_id, node_map, children_map);
                node.children.push(child);
            }
        }

        node
    }

    let mut roots = Vec::new();
    for root_id in &root_ids {
        if node_map.contains_key(root_id) {
            let tree = build_subtree(root_id, &mut node_map, &children_map);
            roots.push(tree);
        }
    }

    roots
}

#[tauri::command]
pub fn get_video_versions(
    shot_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<VideoVersionNode>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, shot_id, parent_version_id, version_number, edit_type, video_path,
                    prompt, settings_json, model_id, is_current, created_at
             FROM video_versions WHERE shot_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let versions: Vec<VideoVersion> = stmt
        .query_map(params![shot_id], |row| {
            let video_path: String = row.get(5)?;
            let is_current_i: i64 = row.get(9)?;

            Ok(VideoVersion {
                id: row.get(0)?,
                shot_id: row.get(1)?,
                parent_version_id: row.get(2)?,
                version_number: row.get(3)?,
                edit_type: row.get(4)?,
                video_url: Some(make_media_url(&app, &video_path)),
                video_path,
                prompt: row.get(6)?,
                settings_json: row.get(7)?,
                model_id: row.get(8)?,
                is_current: is_current_i != 0,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(build_tree(versions))
}

#[tauri::command]
pub fn get_current_video_version(
    shot_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<VideoVersion>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, shot_id, parent_version_id, version_number, edit_type, video_path,
                    prompt, settings_json, model_id, is_current, created_at
             FROM video_versions WHERE shot_id = ?1 AND is_current = 1",
        )
        .map_err(|e| e.to_string())?;

    let version = stmt
        .query_row(params![shot_id], |row| {
            let video_path: String = row.get(5)?;
            let is_current_i: i64 = row.get(9)?;

            Ok(VideoVersion {
                id: row.get(0)?,
                shot_id: row.get(1)?,
                parent_version_id: row.get(2)?,
                version_number: row.get(3)?,
                edit_type: row.get(4)?,
                video_url: Some(make_media_url(&app, &video_path)),
                video_path,
                prompt: row.get(6)?,
                settings_json: row.get(7)?,
                model_id: row.get(8)?,
                is_current: is_current_i != 0,
                created_at: row.get(10)?,
            })
        })
        .ok();

    Ok(version)
}

#[tauri::command]
pub fn switch_to_video_version(
    shot_id: String,
    version_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<VideoVersion, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Clear current flag from all video versions of this shot
    conn.execute(
        "UPDATE video_versions SET is_current = 0 WHERE shot_id = ?1",
        params![shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Set new current version
    conn.execute(
        "UPDATE video_versions SET is_current = 1 WHERE id = ?1 AND shot_id = ?2",
        params![version_id, shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Get the version to find its video_path
    let video_path: String = conn
        .query_row(
            "SELECT video_path FROM video_versions WHERE id = ?1",
            params![version_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Update shot's video_path and status (do NOT reset the image)
    conn.execute(
        "UPDATE shots SET video_path = ?1, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![video_path, shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_version(&conn, &app, &version_id)?
        .ok_or_else(|| "Version not found after update".to_string())
}

#[tauri::command]
pub fn get_video_version_count(
    shot_id: String,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM video_versions WHERE shot_id = ?1",
            params![shot_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count)
}

#[tauri::command]
pub fn create_video_generation_version(
    shot_id: String,
    video_data: Vec<u8>,
    mime_type: String,
    prompt: Option<String>,
    settings_json: Option<String>,
    model_id: Option<String>,
    parent_version_id: Option<String>,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<VideoVersion, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let version_number = get_next_version_number(&conn, &shot_id)?;
    let video_path = media::save_version_video(
        &app,
        &shot_id,
        version_number as i32,
        &video_data,
        &mime_type,
    )?;

    let id = generate_id("vidver");
    let edit_type = if parent_version_id.is_some() {
        "regeneration"
    } else {
        "generation"
    };

    // Clear current flag from all video versions of this shot
    conn.execute(
        "UPDATE video_versions SET is_current = 0 WHERE shot_id = ?1",
        params![shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Insert new version as current
    conn.execute(
        "INSERT INTO video_versions (id, shot_id, parent_version_id, version_number, edit_type, video_path, prompt, settings_json, model_id, is_current)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
        params![id, shot_id, parent_version_id, version_number, edit_type, video_path, prompt, settings_json, model_id],
    )
    .map_err(|e| e.to_string())?;

    // Update shot's video_path to the new version and mark complete
    conn.execute(
        "UPDATE shots SET video_path = ?1, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![video_path, shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_version(&conn, &app, &id)?
        .ok_or_else(|| "Version not found after creation".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::open_test_db;

    fn insert_project_and_storyboard(conn: &rusqlite::Connection) -> (String, String) {
        let proj_id = generate_id("proj");
        let sb_id = generate_id("sb");
        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, 'Test Project')",
            params![proj_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, 'Test SB')",
            params![sb_id, proj_id],
        )
        .unwrap();
        (proj_id, sb_id)
    }

    fn insert_shot(conn: &rusqlite::Connection, sb_id: &str) -> String {
        let shot_id = generate_id("shot");
        conn.execute(
            "INSERT INTO shots (id, storyboard_id, \"order\", status) VALUES (?1, ?2, 1, 'pending')",
            params![shot_id, sb_id],
        )
        .unwrap();
        shot_id
    }

    #[test]
    fn test_video_versions_table_created() {
        let conn = open_test_db();
        // Table should exist and be queryable
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM video_versions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_video_version_insert_and_query() {
        let conn = open_test_db();
        let (_proj_id, sb_id) = insert_project_and_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let ver_id = generate_id("vidver");
        conn.execute(
            "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, prompt, is_current)
             VALUES (?1, ?2, 1, 'generation', 'videos/versions/test/v1.mp4', 'test prompt', 1)",
            params![ver_id, shot_id],
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM video_versions WHERE shot_id = ?1",
                params![shot_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_video_version_cascade_delete() {
        let conn = open_test_db();
        let (_proj_id, sb_id) = insert_project_and_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let ver_id = generate_id("vidver");
        conn.execute(
            "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
             VALUES (?1, ?2, 1, 'generation', 'videos/versions/test/v1.mp4', 1)",
            params![ver_id, shot_id],
        )
        .unwrap();

        // Delete the shot — video_versions should cascade
        conn.execute("DELETE FROM shots WHERE id = ?1", params![shot_id])
            .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM video_versions WHERE shot_id = ?1",
                params![shot_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_next_version_number() {
        let conn = open_test_db();
        let (_proj_id, sb_id) = insert_project_and_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        // No versions yet — should be 1
        assert_eq!(get_next_version_number(&conn, &shot_id).unwrap(), 1);

        // Insert version 1
        conn.execute(
            "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
             VALUES (?1, ?2, 1, 'generation', 'videos/v1.mp4', 1)",
            params![generate_id("vidver"), shot_id],
        )
        .unwrap();

        assert_eq!(get_next_version_number(&conn, &shot_id).unwrap(), 2);
    }

    #[test]
    fn test_build_tree_linear() {
        let v1 = make_version("a", None, 1);
        let v2 = make_version("b", Some("a"), 2);
        let v3 = make_version("c", Some("b"), 3);

        let tree = build_tree(vec![v1, v2, v3]);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].version.id, "a");
        assert_eq!(tree[0].children.len(), 1);
        assert_eq!(tree[0].children[0].version.id, "b");
        assert_eq!(tree[0].children[0].children.len(), 1);
        assert_eq!(tree[0].children[0].children[0].version.id, "c");
    }

    #[test]
    fn test_build_tree_branching() {
        let v1 = make_version("a", None, 1);
        let v2 = make_version("b", Some("a"), 2);
        let v3 = make_version("c", Some("a"), 3);

        let tree = build_tree(vec![v1, v2, v3]);
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].children.len(), 2);
    }

    fn make_version(id: &str, parent: Option<&str>, num: i64) -> VideoVersion {
        VideoVersion {
            id: id.to_string(),
            shot_id: "shot-1".to_string(),
            parent_version_id: parent.map(|s| s.to_string()),
            version_number: num,
            edit_type: "generation".to_string(),
            video_path: format!("videos/versions/shot-1/v{}.mp4", num),
            prompt: Some("test prompt".to_string()),
            settings_json: None,
            model_id: None,
            is_current: false,
            created_at: "2024-01-01".to_string(),
            video_url: None,
        }
    }

    #[test]
    fn test_edit_type_check_constraint() {
        let conn = open_test_db();
        let (_proj_id, sb_id) = insert_project_and_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        // Valid edit types should work
        for edit_type in &["generation", "regeneration", "extend"] {
            let ver_id = generate_id("vidver");
            conn.execute(
                "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
                 VALUES (?1, ?2, 1, ?3, 'videos/v1.mp4', 0)",
                params![ver_id, shot_id, edit_type],
            )
            .unwrap();
        }

        // Invalid edit type should fail
        let result = conn.execute(
            "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
             VALUES (?1, ?2, 1, 'invalid', 'videos/v1.mp4', 0)",
            params![generate_id("vidver"), shot_id],
        );
        assert!(result.is_err());
    }
}
