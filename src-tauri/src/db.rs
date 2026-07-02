use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
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
    let mut conn = Connection::open(db_path)?;

    // Enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Run migrations
    migrate(&mut conn)?;

    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

// Schema migrations, applied in order. State is tracked by SQLite's user_version
// pragma via rusqlite_migration, so each migration runs exactly once.
//
// To change the schema: add a new numbered file under src/migrations/ and append
// an `M::up(include_str!(...))` entry below. Never edit a migration once it has
// shipped; only append.
fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("migrations/01-baseline.sql")),
        M::up(include_str!("migrations/02-clip-trims-and-version-pins.sql")),
    ])
}

fn migrate(conn: &mut Connection) -> Result<(), Box<dyn std::error::Error>> {
    migrations().to_latest(conn)?;
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
        let mut conn = Connection::open_in_memory().expect("Failed to open in-memory DB");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&mut conn).expect("Failed to run migrations");
        conn
    }

    #[test]
    fn migrations_are_valid() {
        migrations().validate().expect("migrations should be valid");
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
    fn legacy_reference_tables_are_absent() {
        let conn = open_test_db();
        for table in ["shot_asset_refs", "storyboard_bibles", "bible_snapshots"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "table {table} should not exist");
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
    fn timeline_clips_have_trim_and_version_columns() {
        let conn = open_test_db();
        let columns: Vec<String> = conn
            .prepare("PRAGMA table_info(timeline_clips)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        for column in ["trim_in", "trim_out", "video_version_id"] {
            assert!(columns.contains(&column.to_string()), "timeline_clips missing {column}");
        }
    }

    #[test]
    fn timeline_edits_table_is_gone() {
        let conn = open_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'timeline_edits'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "timeline_edits should be dropped");
    }

    #[test]
    fn clip_trims_migration_copies_edit_data() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations()
            .to_version(&mut conn, 1)
            .expect("apply baseline only");

        conn.execute("INSERT INTO projects (id, name) VALUES ('p1', 'P')", []).unwrap();
        conn.execute(
            "INSERT INTO storyboards (id, project_id, name) VALUES ('sb1', 'p1', 'SB')",
            [],
        )
        .unwrap();
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES ('sh1', 'sb1', 1, 'complete')"#,
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO timeline_edits (id, storyboard_id, shot_id, trim_in, trim_out)
             VALUES ('e1', 'sb1', 'sh1', 1.5, 6.5)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time)
             VALUES ('c1', 'sb1', 'sh1', 'V1', 0.0)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).expect("apply remaining migrations");

        let (trim_in, trim_out): (f64, f64) = conn
            .query_row(
                "SELECT trim_in, trim_out FROM timeline_clips WHERE id = 'c1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(trim_in, 1.5);
        assert_eq!(trim_out, 6.5);
    }

    #[test]
    fn clips_without_edits_migrate_with_null_trims() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations().to_version(&mut conn, 1).unwrap();

        conn.execute("INSERT INTO projects (id, name) VALUES ('p1', 'P')", []).unwrap();
        conn.execute(
            "INSERT INTO storyboards (id, project_id, name) VALUES ('sb1', 'p1', 'SB')",
            [],
        )
        .unwrap();
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES ('sh1', 'sb1', 1, 'complete')"#,
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time)
             VALUES ('c1', 'sb1', 'sh1', 'V1', 0.0)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let (trim_in, trim_out): (Option<f64>, Option<f64>) = conn
            .query_row(
                "SELECT trim_in, trim_out FROM timeline_clips WHERE id = 'c1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(trim_in, None);
        assert_eq!(trim_out, None);
    }

    #[test]
    fn deleting_video_version_nulls_clip_pin() {
        let conn = open_test_db();
        conn.execute("INSERT INTO projects (id, name) VALUES ('p1', 'P')", []).unwrap();
        conn.execute(
            "INSERT INTO storyboards (id, project_id, name) VALUES ('sb1', 'p1', 'SB')",
            [],
        )
        .unwrap();
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES ('sh1', 'sb1', 1, 'complete')"#,
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
             VALUES ('v1', 'sh1', 1, 'generation', 'videos/sh1.mp4', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time, video_version_id)
             VALUES ('c1', 'sb1', 'sh1', 'V1', 0.0, 'v1')",
            [],
        )
        .unwrap();

        conn.execute("DELETE FROM video_versions WHERE id = 'v1'", []).unwrap();

        let version_id: Option<String> = conn
            .query_row(
                "SELECT video_version_id FROM timeline_clips WHERE id = 'c1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version_id, None, "pin should reset to follow-current");
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
