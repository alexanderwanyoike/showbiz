use crate::db::{generate_id, DbState};
use crate::media;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Clone)]
pub struct ImageVersion {
    pub id: String,
    pub shot_id: String,
    pub parent_version_id: Option<String>,
    pub version_number: i64,
    pub edit_type: String,
    pub image_path: String,
    pub prompt: Option<String>,
    pub edit_prompt: Option<String>,
    pub mask_path: Option<String>,
    pub is_current: bool,
    pub created_at: String,
    pub image_url: Option<String>,
    pub mask_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImageVersionNode {
    pub version: ImageVersion,
    pub children: Vec<ImageVersionNode>,
}

/// Build an absolute file path for a media file.
/// Cache-busting timestamps are added on the TypeScript side via convertFileSrc.
fn make_media_url(app: &AppHandle, relative_path: &str) -> String {
    let base = media::get_media_base_dir(app);
    base.join(relative_path).to_string_lossy().into_owned()
}

/// Query a single image version by ID and return it with URLs.
fn query_version(
    conn: &rusqlite::Connection,
    app: &AppHandle,
    version_id: &str,
) -> Result<Option<ImageVersion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, shot_id, parent_version_id, version_number, edit_type, image_path,
                    prompt, edit_prompt, mask_path, is_current, created_at
             FROM image_versions WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let version = stmt
        .query_row(params![version_id], |row| {
            let image_path: String = row.get(5)?;
            let mask_path: Option<String> = row.get(8)?;
            let is_current_i: i64 = row.get(9)?;

            let image_url = Some(make_media_url(app, &image_path));
            let mask_url = mask_path.as_ref().map(|p| make_media_url(app, p));

            Ok(ImageVersion {
                id: row.get(0)?,
                shot_id: row.get(1)?,
                parent_version_id: row.get(2)?,
                version_number: row.get(3)?,
                edit_type: row.get(4)?,
                image_path,
                prompt: row.get(6)?,
                edit_prompt: row.get(7)?,
                mask_path,
                is_current: is_current_i != 0,
                created_at: row.get(10)?,
                image_url,
                mask_url,
            })
        })
        .ok();

    Ok(version)
}

/// Get next version number for a shot.
fn get_next_version_number(conn: &rusqlite::Connection, shot_id: &str) -> Result<i64, String> {
    let max_ver: Option<i64> = conn
        .query_row(
            "SELECT MAX(version_number) FROM image_versions WHERE shot_id = ?1",
            params![shot_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    Ok(max_ver.unwrap_or(0) + 1)
}

/// Build a tree structure from a flat list of versions.
pub(crate) fn build_tree(versions: Vec<ImageVersion>) -> Vec<ImageVersionNode> {
    use std::collections::HashMap;

    let mut node_map: HashMap<String, ImageVersionNode> = HashMap::new();
    let mut order: Vec<String> = Vec::new();

    // Create nodes for all versions
    for version in &versions {
        order.push(version.id.clone());
        node_map.insert(
            version.id.clone(),
            ImageVersionNode {
                version: version.clone(),
                children: Vec::new(),
            },
        );
    }

    // Build parent-child relationships
    // We need to collect children first, then insert them
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
                // Parent was deleted, treat as root
                root_ids.push(version.id.clone());
            }
        } else {
            root_ids.push(version.id.clone());
        }
    }

    // Recursively build the tree
    fn build_subtree(
        node_id: &str,
        node_map: &mut HashMap<String, ImageVersionNode>,
        children_map: &HashMap<String, Vec<String>>,
    ) -> ImageVersionNode {
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
pub fn get_image_versions(
    shot_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<ImageVersionNode>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, shot_id, parent_version_id, version_number, edit_type, image_path,
                    prompt, edit_prompt, mask_path, is_current, created_at
             FROM image_versions WHERE shot_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let versions: Vec<ImageVersion> = stmt
        .query_map(params![shot_id], |row| {
            let image_path: String = row.get(5)?;
            let mask_path: Option<String> = row.get(8)?;
            let is_current_i: i64 = row.get(9)?;

            let image_url = Some(make_media_url(&app, &image_path));
            let mask_url = mask_path.as_ref().map(|p| make_media_url(&app, p));

            Ok(ImageVersion {
                id: row.get(0)?,
                shot_id: row.get(1)?,
                parent_version_id: row.get(2)?,
                version_number: row.get(3)?,
                edit_type: row.get(4)?,
                image_path,
                prompt: row.get(6)?,
                edit_prompt: row.get(7)?,
                mask_path,
                is_current: is_current_i != 0,
                created_at: row.get(10)?,
                image_url,
                mask_url,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(build_tree(versions))
}

#[tauri::command]
pub fn switch_to_version(
    shot_id: String,
    version_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ImageVersion, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Clear current flag from all versions of this shot
    conn.execute(
        "UPDATE image_versions SET is_current = 0 WHERE shot_id = ?1",
        params![shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Set new current version
    conn.execute(
        "UPDATE image_versions SET is_current = 1 WHERE id = ?1 AND shot_id = ?2",
        params![version_id, shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Get the version to find its image_path and prompt
    let (image_path, prompt): (String, Option<String>) = conn
        .query_row(
            "SELECT image_path, prompt FROM image_versions WHERE id = ?1",
            params![version_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Update shot's image_path, reset video
    conn.execute(
        "UPDATE shots SET image_path = ?1, image_prompt = ?2, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![image_path, prompt, shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_version(&conn, &app, &version_id)?
        .ok_or_else(|| "Version not found after update".to_string())
}

#[tauri::command]
pub fn create_generation_version(
    shot_id: String,
    prompt: String,
    image_base64: String,
    parent_version_id: Option<String>,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ImageVersion, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let version_number = get_next_version_number(&conn, &shot_id)?;
    let image_path =
        media::save_version_image(&app, &shot_id, version_number as i32, &image_base64)?;

    let id = generate_id("imgver");
    let edit_type = if parent_version_id.is_some() {
        "regeneration"
    } else {
        "generation"
    };

    // Clear current flag from all versions of this shot
    conn.execute(
        "UPDATE image_versions SET is_current = 0 WHERE shot_id = ?1",
        params![shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Insert new version as current
    conn.execute(
        "INSERT INTO image_versions (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, 1)",
        params![id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt],
    )
    .map_err(|e| e.to_string())?;

    // Update shot's image_path to the new version, reset video
    conn.execute(
        "UPDATE shots SET image_path = ?1, image_prompt = ?2, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![image_path, prompt, shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_version(&conn, &app, &id)?
        .ok_or_else(|| "Version not found after creation".to_string())
}

#[tauri::command]
pub fn create_remix_version(
    shot_id: String,
    parent_version_id: String,
    edit_prompt: String,
    result_image_base64: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ImageVersion, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get parent version's prompt
    let parent_prompt: Option<String> = conn
        .query_row(
            "SELECT prompt FROM image_versions WHERE id = ?1",
            params![parent_version_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let version_number = get_next_version_number(&conn, &shot_id)?;
    let image_path = media::save_version_image(
        &app,
        &shot_id,
        version_number as i32,
        &result_image_base64,
    )?;

    let id = generate_id("imgver");

    // Clear current flag from all versions of this shot
    conn.execute(
        "UPDATE image_versions SET is_current = 0 WHERE shot_id = ?1",
        params![shot_id],
    )
    .map_err(|e| e.to_string())?;

    // Insert new version as current
    conn.execute(
        "INSERT INTO image_versions (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current)
         VALUES (?1, ?2, ?3, ?4, 'remix', ?5, ?6, ?7, NULL, 1)",
        params![id, shot_id, parent_version_id, version_number, image_path, parent_prompt, edit_prompt],
    )
    .map_err(|e| e.to_string())?;

    // Update shot's image_path to the new version, reset video
    conn.execute(
        "UPDATE shots SET image_path = ?1, image_prompt = ?2, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![image_path, edit_prompt, shot_id],
    )
    .map_err(|e| e.to_string())?;

    query_version(&conn, &app, &id)?
        .ok_or_else(|| "Version not found after creation".to_string())
}

#[tauri::command]
pub fn get_version_image_base64(
    version_id: String,
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let image_path: Option<String> = conn
        .query_row(
            "SELECT image_path FROM image_versions WHERE id = ?1",
            params![version_id],
            |row| row.get(0),
        )
        .ok();

    match image_path {
        Some(path) => media::get_image_as_base64(&app, &path),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn delete_version(
    version_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let changes = conn
        .execute(
            "DELETE FROM image_versions WHERE id = ?1",
            params![version_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

#[tauri::command]
pub fn get_version_count(
    shot_id: String,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM image_versions WHERE shot_id = ?1",
            params![shot_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_version(id: &str, parent: Option<&str>) -> ImageVersion {
        ImageVersion {
            id: id.to_string(),
            shot_id: "shot-1".to_string(),
            parent_version_id: parent.map(|s| s.to_string()),
            version_number: 1,
            edit_type: "generation".to_string(),
            image_path: format!("images/versions/shot-1/{}.png", id),
            prompt: Some("test prompt".to_string()),
            edit_prompt: None,
            mask_path: None,
            is_current: false,
            created_at: "2024-01-01".to_string(),
            image_url: None,
            mask_url: None,
        }
    }

    #[test]
    fn build_tree_empty_list() {
        let result = build_tree(vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn build_tree_single_root() {
        let versions = vec![make_version("a", None)];
        let result = build_tree(versions);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].version.id, "a");
        assert!(result[0].children.is_empty());
    }

    #[test]
    fn build_tree_linear_chain() {
        let versions = vec![
            make_version("a", None),
            make_version("b", Some("a")),
            make_version("c", Some("b")),
        ];
        let result = build_tree(versions);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].version.id, "a");
        assert_eq!(result[0].children.len(), 1);
        assert_eq!(result[0].children[0].version.id, "b");
        assert_eq!(result[0].children[0].children.len(), 1);
        assert_eq!(result[0].children[0].children[0].version.id, "c");
    }

    #[test]
    fn build_tree_branching() {
        let versions = vec![
            make_version("a", None),
            make_version("b", Some("a")),
            make_version("c", Some("a")),
        ];
        let result = build_tree(versions);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].version.id, "a");
        assert_eq!(result[0].children.len(), 2);
        let child_ids: Vec<&str> = result[0].children.iter().map(|c| c.version.id.as_str()).collect();
        assert!(child_ids.contains(&"b"));
        assert!(child_ids.contains(&"c"));
    }

    #[test]
    fn build_tree_orphan_parent_treated_as_root() {
        let versions = vec![
            make_version("a", None),
            make_version("b", Some("nonexistent")),
        ];
        let result = build_tree(versions);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn build_tree_multiple_roots() {
        let versions = vec![
            make_version("a", None),
            make_version("b", None),
            make_version("c", Some("a")),
        ];
        let result = build_tree(versions);
        assert_eq!(result.len(), 2);
        // First root should have a child
        let root_a = result.iter().find(|n| n.version.id == "a").unwrap();
        assert_eq!(root_a.children.len(), 1);
        let root_b = result.iter().find(|n| n.version.id == "b").unwrap();
        assert!(root_b.children.is_empty());
    }
}
