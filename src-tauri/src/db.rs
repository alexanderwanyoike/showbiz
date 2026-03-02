use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

// Ensure DbState can be shared across threads
unsafe impl Send for DbState {}
unsafe impl Sync for DbState {}

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    let data_dir = app_data_dir.join("data");
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("showbiz.db");
    let conn = Connection::open(db_path)?;

    // Enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Run migrations
    migrate(&conn)?;

    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

fn migrate(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS storyboards (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            image_model TEXT NOT NULL DEFAULT 'imagen4',
            video_model TEXT NOT NULL DEFAULT 'veo3',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shots (
            id TEXT PRIMARY KEY,
            storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
            "order" INTEGER NOT NULL,
            duration INTEGER NOT NULL DEFAULT 8,
            image_prompt TEXT,
            image_path TEXT,
            video_prompt TEXT,
            video_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_storyboards_project ON storyboards(project_id);
        CREATE INDEX IF NOT EXISTS idx_shots_storyboard ON shots(storyboard_id);

        CREATE TABLE IF NOT EXISTS timeline_edits (
            id TEXT PRIMARY KEY,
            storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
            shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
            trim_in REAL NOT NULL DEFAULT 0,
            trim_out REAL NOT NULL DEFAULT 8,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(storyboard_id, shot_id)
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_edits_storyboard ON timeline_edits(storyboard_id);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS image_versions (
            id TEXT PRIMARY KEY,
            shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
            parent_version_id TEXT REFERENCES image_versions(id) ON DELETE SET NULL,
            version_number INTEGER NOT NULL,
            edit_type TEXT NOT NULL CHECK(edit_type IN ('generation', 'regeneration', 'remix', 'inpaint')),
            image_path TEXT NOT NULL,
            prompt TEXT,
            edit_prompt TEXT,
            mask_path TEXT,
            is_current INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_image_versions_shot ON image_versions(shot_id);
        CREATE INDEX IF NOT EXISTS idx_image_versions_parent ON image_versions(parent_version_id);

        CREATE TABLE IF NOT EXISTS video_versions (
            id TEXT PRIMARY KEY,
            shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
            parent_version_id TEXT REFERENCES video_versions(id) ON DELETE SET NULL,
            version_number INTEGER NOT NULL,
            edit_type TEXT NOT NULL CHECK(edit_type IN ('generation', 'regeneration', 'extend')),
            video_path TEXT NOT NULL,
            prompt TEXT,
            settings_json TEXT,
            model_id TEXT,
            is_current INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_video_versions_shot ON video_versions(shot_id);
        CREATE INDEX IF NOT EXISTS idx_video_versions_parent ON video_versions(parent_version_id);
        "#,
    )?;

    // Migration: Add model columns to existing storyboards table if they don't exist
    let has_image_model: bool = conn
        .prepare("PRAGMA table_info(storyboards)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|col| col == "image_model");

    if !has_image_model {
        conn.execute_batch(
            "ALTER TABLE storyboards ADD COLUMN image_model TEXT NOT NULL DEFAULT 'imagen4'",
        )?;
    }

    let has_video_model: bool = conn
        .prepare("PRAGMA table_info(storyboards)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|col| col == "video_model");

    if !has_video_model {
        conn.execute_batch(
            "ALTER TABLE storyboards ADD COLUMN video_model TEXT NOT NULL DEFAULT 'veo3'",
        )?;
    }

    // Migration: Create initial image versions for existing shots with images
    let mut stmt = conn.prepare(
        r#"
        SELECT s.id, s.image_path, s.image_prompt
        FROM shots s
        LEFT JOIN image_versions iv ON s.id = iv.shot_id
        WHERE s.image_path IS NOT NULL AND iv.id IS NULL
        "#,
    )?;

    let shots_needing_versions: Vec<(String, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    if !shots_needing_versions.is_empty() {
        let insert_sql = r#"
            INSERT INTO image_versions (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, is_current)
            VALUES (?1, ?2, NULL, 1, 'generation', ?3, ?4, 1)
        "#;

        for (shot_id, image_path, image_prompt) in &shots_needing_versions {
            let version_id = generate_id("imgver");
            conn.execute(
                insert_sql,
                params![version_id, shot_id, image_path, image_prompt],
            )?;
        }
    }

    // Migration: Create initial video versions for existing shots with videos
    let mut video_stmt = conn.prepare(
        r#"
        SELECT s.id, s.video_path, s.video_prompt
        FROM shots s
        LEFT JOIN video_versions vv ON s.id = vv.shot_id
        WHERE s.video_path IS NOT NULL AND vv.id IS NULL
        "#,
    )?;

    let shots_needing_video_versions: Vec<(String, String, Option<String>)> = video_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    if !shots_needing_video_versions.is_empty() {
        let insert_video_sql = r#"
            INSERT INTO video_versions (id, shot_id, parent_version_id, version_number, edit_type, video_path, prompt, is_current)
            VALUES (?1, ?2, NULL, 1, 'generation', ?3, ?4, 1)
        "#;

        for (shot_id, video_path, video_prompt) in &shots_needing_video_versions {
            let version_id = generate_id("vidver");
            conn.execute(
                insert_video_sql,
                params![version_id, shot_id, video_path, video_prompt],
            )?;
        }
    }

    Ok(())
}

/// Generate a unique ID with a prefix, e.g. "proj-1708123456789-a1b2c3d"
pub fn generate_id(prefix: &str) -> String {
    let ts = chrono::Utc::now().timestamp_millis();
    let rand_part = &uuid::Uuid::new_v4().to_string()[..7];
    format!("{}-{}-{}", prefix, ts, rand_part)
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// Open an in-memory SQLite database with migrations applied.
    /// Used by all Rust integration tests.
    pub fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory DB");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&conn).expect("Failed to run migrations");
        conn
    }

    #[test]
    fn generate_id_has_correct_prefix() {
        let id = generate_id("proj");
        assert!(id.starts_with("proj-"), "ID should start with 'proj-': {}", id);
    }

    #[test]
    fn generate_id_contains_timestamp() {
        let before = chrono::Utc::now().timestamp_millis();
        let id = generate_id("test");
        let after = chrono::Utc::now().timestamp_millis();

        let parts: Vec<&str> = id.splitn(3, '-').collect();
        assert_eq!(parts.len(), 3, "ID should have 3 parts: {}", id);

        let ts: i64 = parts[1].parse().expect("Middle part should be a timestamp");
        assert!(ts >= before && ts <= after, "Timestamp should be current");
    }

    #[test]
    fn generate_id_has_correct_format() {
        let id = generate_id("sb");
        let parts: Vec<&str> = id.splitn(3, '-').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], "sb");
        // Timestamp part should be numeric
        assert!(parts[1].parse::<i64>().is_ok());
        // Random part should be 7 chars
        assert_eq!(parts[2].len(), 7);
    }

    #[test]
    fn generate_id_is_unique() {
        let ids: Vec<String> = (0..100).map(|_| generate_id("x")).collect();
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(ids.len(), unique.len(), "All IDs should be unique");
    }
}
