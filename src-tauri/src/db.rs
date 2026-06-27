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
    Migrations::new(vec![M::up(include_str!("migrations/01-baseline.sql"))])
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
