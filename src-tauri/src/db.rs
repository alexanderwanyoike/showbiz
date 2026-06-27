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
            end_frame_path TEXT,
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

        CREATE TABLE IF NOT EXISTS timeline_tracks (
            id TEXT PRIMARY KEY,
            storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
            track_id TEXT NOT NULL,
            name TEXT NOT NULL,
            track_type TEXT NOT NULL CHECK(track_type IN ('video', 'audio')),
            position INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(storyboard_id, track_id)
        );
        CREATE INDEX IF NOT EXISTS idx_timeline_tracks_storyboard ON timeline_tracks(storyboard_id);

        CREATE TABLE IF NOT EXISTS timeline_clips (
            id TEXT PRIMARY KEY,
            storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
            shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
            track_id TEXT NOT NULL,
            start_time REAL NOT NULL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_timeline_clips_storyboard ON timeline_clips(storyboard_id);

        CREATE TABLE IF NOT EXISTS bibles (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bibles_project ON bibles(project_id);

        CREATE TABLE IF NOT EXISTS bible_assets (
            id TEXT PRIMARY KEY,
            bible_id TEXT NOT NULL REFERENCES bibles(id) ON DELETE CASCADE,
            asset_type TEXT NOT NULL CHECK(asset_type IN ('character', 'location', 'prop', 'style', 'reference', 'note', 'scene')),
            name TEXT NOT NULL,
            summary TEXT,
            description TEXT,
            tags_json TEXT,
            rules_json TEXT,
            consent_confirmed INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'archived')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bible_assets_bible ON bible_assets(bible_id);

        CREATE TABLE IF NOT EXISTS bible_asset_variants (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL REFERENCES bible_assets(id) ON DELETE CASCADE,
            parent_variant_id TEXT REFERENCES bible_asset_variants(id) ON DELETE SET NULL,
            name TEXT,
            status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate', 'approved', 'rejected')),
            media_path TEXT,
            prompt TEXT,
            negative_prompt TEXT,
            model_id TEXT,
            source_kind TEXT NOT NULL CHECK(source_kind IN ('uploaded', 'generated', 'edited', 'imported')),
            is_primary INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bible_asset_variants_asset ON bible_asset_variants(asset_id);

        CREATE TRIGGER IF NOT EXISTS trg_projects_create_main_bible
        AFTER INSERT ON projects
        WHEN NOT EXISTS (SELECT 1 FROM bibles WHERE project_id = NEW.id)
        BEGIN
            INSERT INTO bibles (id, project_id, name, is_default)
            VALUES ('bible-' || NEW.id, NEW.id, 'Main Bible', 1);
        END;
        "#,
    )?;

    conn.execute_batch(
        r#"
        INSERT OR IGNORE INTO bibles (id, project_id, name, is_default)
        SELECT 'bible-' || p.id, p.id, 'Main Bible', 1
        FROM projects p
        WHERE NOT EXISTS (SELECT 1 FROM bibles b WHERE b.project_id = p.id);
        "#,
    )?;

    // Migration: Replace position-based timeline_clips with start_time-based
    let has_start_time: bool = conn
        .prepare("PRAGMA table_info(timeline_clips)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|col| col == "start_time");

    if !has_start_time {
        conn.execute_batch(
            "DROP TABLE IF EXISTS timeline_clips;
             CREATE TABLE timeline_clips (
                 id TEXT PRIMARY KEY,
                 storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
                 shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
                 track_id TEXT NOT NULL,
                 start_time REAL NOT NULL DEFAULT 0.0,
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
             );
             CREATE INDEX IF NOT EXISTS idx_timeline_clips_storyboard ON timeline_clips(storyboard_id);",
        )?;
    }

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

    // Migration: shots gain an optional end frame for start/end-frame video generation
    let has_end_frame: bool = conn
        .prepare("PRAGMA table_info(shots)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|col| col == "end_frame_path");
    if !has_end_frame {
        conn.execute_batch("ALTER TABLE shots ADD COLUMN end_frame_path TEXT")?;
    }

    // Migration: drop the removed reference-to-video tables from existing databases
    conn.execute_batch(
        "DROP TABLE IF EXISTS shot_asset_refs;
         DROP TABLE IF EXISTS storyboard_bibles;
         DROP TABLE IF EXISTS bible_snapshots;",
    )?;

    // Migration: allow the 'scene' asset type (composed frames) on existing databases.
    // SQLite cannot alter a CHECK constraint, so rebuild bible_assets when 'scene' is absent.
    // The rebuild preserves all rows, so bible_asset_variants foreign keys stay valid.
    let bible_assets_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bible_assets'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    if !bible_assets_sql.is_empty() && !bible_assets_sql.contains("'scene'") {
        conn.execute_batch(
            "CREATE TABLE bible_assets_new (
                 id TEXT PRIMARY KEY,
                 bible_id TEXT NOT NULL REFERENCES bibles(id) ON DELETE CASCADE,
                 asset_type TEXT NOT NULL CHECK(asset_type IN ('character', 'location', 'prop', 'style', 'reference', 'note', 'scene')),
                 name TEXT NOT NULL,
                 summary TEXT,
                 description TEXT,
                 tags_json TEXT,
                 rules_json TEXT,
                 consent_confirmed INTEGER NOT NULL DEFAULT 0,
                 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'archived')),
                 sort_order INTEGER NOT NULL DEFAULT 0,
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
             );
             INSERT INTO bible_assets_new SELECT * FROM bible_assets;
             DROP TABLE bible_assets;
             ALTER TABLE bible_assets_new RENAME TO bible_assets;
             CREATE INDEX IF NOT EXISTS idx_bible_assets_bible ON bible_assets(bible_id);",
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

    #[test]
    fn migrations_create_bible_tables() {
        let conn = open_test_db();
        for table in ["bibles", "bible_assets", "bible_asset_variants"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
    }

    #[test]
    fn migrations_drop_reference_to_video_tables() {
        let conn = open_test_db();
        for table in ["shot_asset_refs", "storyboard_bibles", "bible_snapshots"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "table {table} should be removed");
        }
    }

    #[test]
    fn shots_have_end_frame_and_no_compile_columns() {
        let conn = open_test_db();
        let columns: Vec<String> = conn
            .prepare("PRAGMA table_info(shots)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(columns.contains(&"end_frame_path".to_string()));
        for removed in ["intent_action", "intent_camera", "intent_mood", "compiled_prompt", "prompt_override"] {
            assert!(!columns.contains(&removed.to_string()), "shots should not have {removed}");
        }
    }

    #[test]
    fn creating_project_creates_main_bible() {
        let conn = open_test_db();
        let project_id = generate_id("proj");
        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            rusqlite::params![project_id, "Series"],
        )
        .unwrap();

        let bible_name: String = conn
            .query_row(
                "SELECT name FROM bibles WHERE project_id = ?1",
                rusqlite::params![project_id],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(bible_name, "Main Bible");
    }

    #[test]
    fn deleting_project_cascades_bible_data() {
        let conn = open_test_db();
        let project_id = generate_id("proj");
        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            rusqlite::params![project_id, "Series"],
        )
        .unwrap();
        let bible_id: String = conn
            .query_row(
                "SELECT id FROM bibles WHERE project_id = ?1",
                rusqlite::params![project_id],
                |row| row.get(0),
            )
            .unwrap();
        let asset_id = generate_id("asset");
        conn.execute(
            "INSERT INTO bible_assets (id, bible_id, asset_type, name) VALUES (?1, ?2, 'character', 'Mara')",
            rusqlite::params![asset_id, bible_id],
        )
        .unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![project_id])
            .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bible_assets", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn scene_asset_type_is_allowed() {
        let conn = open_test_db();
        let project_id = generate_id("proj");
        conn.execute(
            "INSERT INTO projects (id, name) VALUES (?1, ?2)",
            rusqlite::params![project_id, "Series"],
        )
        .unwrap();
        let bible_id: String = conn
            .query_row(
                "SELECT id FROM bibles WHERE project_id = ?1",
                rusqlite::params![project_id],
                |row| row.get(0),
            )
            .unwrap();
        let asset_id = generate_id("asset");
        conn.execute(
            "INSERT INTO bible_assets (id, bible_id, asset_type, name) VALUES (?1, ?2, 'scene', 'Mara at the gate')",
            rusqlite::params![asset_id, bible_id],
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bible_assets WHERE asset_type = 'scene'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
