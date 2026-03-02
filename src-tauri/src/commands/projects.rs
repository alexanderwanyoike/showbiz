use crate::db::{generate_id, DbState};
use crate::media;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State};

// ==================== Data Structures ====================

#[derive(Debug, Serialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Storyboard {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub image_model: String,
    pub video_model: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct StoryboardWithPreview {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub image_model: String,
    pub video_model: String,
    pub created_at: String,
    pub updated_at: String,
    pub preview_image_path: Option<String>,
}

// ==================== Project Commands ====================

#[tauri::command]
pub fn get_project(id: String, state: State<'_, DbState>) -> Result<Option<Project>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, name, created_at, updated_at FROM projects WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    );
    match result {
        Ok(project) => Ok(Some(project)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[tauri::command]
pub fn create_project(name: String, state: State<'_, DbState>) -> Result<Project, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id("proj");

    conn.execute(
        "INSERT INTO projects (id, name) VALUES (?1, ?2)",
        params![id, name],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, created_at, updated_at FROM projects WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let project = stmt
        .query_row(params![id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub fn update_project(
    id: String,
    name: String,
    state: State<'_, DbState>,
) -> Result<Project, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE projects SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![name, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, created_at, updated_at FROM projects WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let project = stmt
        .query_row(params![id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub fn delete_project(
    id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get all storyboards for this project
    let mut sb_stmt = conn
        .prepare("SELECT id FROM storyboards WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;

    let storyboard_ids: Vec<String> = sb_stmt
        .query_map(params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // For each storyboard, get all shots and delete their media
    for sb_id in &storyboard_ids {
        let mut shot_stmt = conn
            .prepare("SELECT id, image_path, video_path FROM shots WHERE storyboard_id = ?1")
            .map_err(|e| e.to_string())?;

        let shots: Vec<(String, Option<String>, Option<String>)> = shot_stmt
            .query_map(params![sb_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (shot_id, image_path, video_path) in &shots {
            if let Some(path) = image_path {
                media::delete_media(&app, path);
            }
            if let Some(path) = video_path {
                media::delete_media(&app, path);
            }
            media::delete_version_images(&app, shot_id);
            media::delete_mask_images(&app, shot_id);
        }
    }

    // Delete the project (cascades to storyboards and shots)
    let changes = conn
        .execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

// ==================== Storyboard Commands ====================

#[tauri::command]
pub fn get_storyboards(
    project_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<Storyboard>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, image_model, video_model, created_at, updated_at
             FROM storyboards WHERE project_id = ?1 ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let storyboards = stmt
        .query_map(params![project_id], |row| {
            Ok(Storyboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                image_model: row.get(3)?,
                video_model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(storyboards)
}

#[tauri::command]
pub fn get_storyboards_with_preview(
    app: AppHandle,
    project_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<StoryboardWithPreview>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                s.id, s.project_id, s.name, s.image_model, s.video_model, s.created_at, s.updated_at,
                (
                    SELECT sh.image_path
                    FROM shots sh
                    WHERE sh.storyboard_id = s.id AND sh.image_path IS NOT NULL
                    ORDER BY sh."order" ASC
                    LIMIT 1
                ) as preview_image_path
            FROM storyboards s
            WHERE s.project_id = ?1
            ORDER BY s.updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let media_base = media::get_media_base_dir(&app);

    let storyboards = stmt
        .query_map(params![project_id], |row| {
            let relative_path: Option<String> = row.get(7)?;
            let preview_image_path = relative_path
                .map(|p| media_base.join(p).to_string_lossy().into_owned());
            Ok(StoryboardWithPreview {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                image_model: row.get(3)?,
                video_model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                preview_image_path,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(storyboards)
}

#[tauri::command]
pub fn get_storyboard(
    id: String,
    state: State<'_, DbState>,
) -> Result<Option<Storyboard>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, image_model, video_model, created_at, updated_at
             FROM storyboards WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let storyboard = stmt
        .query_row(params![id], |row| {
            Ok(Storyboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                image_model: row.get(3)?,
                video_model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .ok();

    Ok(storyboard)
}

#[tauri::command]
pub fn create_storyboard(
    project_id: String,
    name: String,
    state: State<'_, DbState>,
) -> Result<Storyboard, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id("sb");

    conn.execute(
        "INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, ?3)",
        params![id, project_id, name],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, image_model, video_model, created_at, updated_at
             FROM storyboards WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let storyboard = stmt
        .query_row(params![id], |row| {
            Ok(Storyboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                image_model: row.get(3)?,
                video_model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(storyboard)
}

#[tauri::command]
pub fn update_storyboard(
    id: String,
    name: String,
    state: State<'_, DbState>,
) -> Result<Storyboard, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE storyboards SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![name, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, image_model, video_model, created_at, updated_at
             FROM storyboards WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let storyboard = stmt
        .query_row(params![id], |row| {
            Ok(Storyboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                image_model: row.get(3)?,
                video_model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(storyboard)
}

#[tauri::command]
pub fn delete_storyboard(
    id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get all shots for this storyboard and delete their media
    let mut shot_stmt = conn
        .prepare("SELECT id, image_path, video_path FROM shots WHERE storyboard_id = ?1")
        .map_err(|e| e.to_string())?;

    let shots: Vec<(String, Option<String>, Option<String>)> = shot_stmt
        .query_map(params![id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (shot_id, image_path, video_path) in &shots {
        if let Some(path) = image_path {
            media::delete_media(&app, path);
        }
        if let Some(path) = video_path {
            media::delete_media(&app, path);
        }
        media::delete_version_images(&app, shot_id);
        media::delete_mask_images(&app, shot_id);
    }

    // Delete the storyboard (cascades to shots)
    let changes = conn
        .execute("DELETE FROM storyboards WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

#[tauri::command]
pub fn update_storyboard_models(
    id: String,
    image_model: String,
    video_model: String,
    state: State<'_, DbState>,
) -> Result<Storyboard, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE storyboards SET image_model = ?1, video_model = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![image_model, video_model, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, image_model, video_model, created_at, updated_at
             FROM storyboards WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let storyboard = stmt
        .query_row(params![id], |row| {
            Ok(Storyboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                image_model: row.get(3)?,
                video_model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(storyboard)
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    #[test]
    fn create_and_get_project() {
        let conn = crate::db::tests::open_test_db();
        let id = crate::db::generate_id("proj");

        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            params![id, "My Project"],
        ).unwrap();

        let name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(name, "My Project");
    }

    #[test]
    fn update_project_name() {
        let conn = crate::db::tests::open_test_db();
        let id = crate::db::generate_id("proj");

        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            params![id, "Old Name"],
        ).unwrap();

        conn.execute(
            "UPDATE projects SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params!["New Name", id],
        ).unwrap();

        let name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(name, "New Name");
    }

    #[test]
    fn cascade_delete_project() {
        let conn = crate::db::tests::open_test_db();

        let proj_id = crate::db::generate_id("proj");
        conn.execute("INSERT INTO projects (id, name) VALUES (?1, ?2)", params![proj_id, "P"]).unwrap();

        let sb_id = crate::db::generate_id("sb");
        conn.execute(
            "INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, ?3)",
            params![sb_id, proj_id, "SB"],
        ).unwrap();

        let shot_id = crate::db::generate_id("shot");
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?1, ?2, 1, 'pending')"#,
            params![shot_id, sb_id],
        ).unwrap();

        conn.execute("DELETE FROM projects WHERE id = ?1", params![proj_id]).unwrap();

        let sb_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM storyboards WHERE id = ?1",
            params![sb_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(sb_count, 0);

        let shot_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM shots WHERE id = ?1",
            params![shot_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(shot_count, 0);
    }

    #[test]
    fn get_storyboards_with_preview_null_when_no_shots() {
        let conn = crate::db::tests::open_test_db();

        let proj_id = crate::db::generate_id("proj");
        conn.execute("INSERT INTO projects (id, name) VALUES (?1, ?2)", params![proj_id, "P"]).unwrap();

        let sb_id = crate::db::generate_id("sb");
        conn.execute(
            "INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, ?3)",
            params![sb_id, proj_id, "SB"],
        ).unwrap();

        let preview: Option<String> = conn.query_row(
            r#"
            SELECT (
                SELECT sh.image_path FROM shots sh
                WHERE sh.storyboard_id = s.id AND sh.image_path IS NOT NULL
                ORDER BY sh."order" ASC LIMIT 1
            ) as preview_image_path
            FROM storyboards s WHERE s.id = ?1
            "#,
            params![sb_id],
            |row| row.get(0),
        ).unwrap();

        assert!(preview.is_none());
    }
}
