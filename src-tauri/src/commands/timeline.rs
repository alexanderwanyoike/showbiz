use crate::db::{generate_id, DbState};
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct TimelineEdit {
    pub id: String,
    pub storyboard_id: String,
    pub shot_id: String,
    pub trim_in: f64,
    pub trim_out: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_timeline_edits(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<TimelineEdit>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, storyboard_id, shot_id, trim_in, trim_out, created_at, updated_at
             FROM timeline_edits WHERE storyboard_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let edits = stmt
        .query_map(params![storyboard_id], |row| {
            Ok(TimelineEdit {
                id: row.get(0)?,
                storyboard_id: row.get(1)?,
                shot_id: row.get(2)?,
                trim_in: row.get(3)?,
                trim_out: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(edits)
}

/// Validate trim values for a timeline edit.
/// Returns Ok(()) if valid, Err with message if invalid.
pub fn validate_trim_values(trim_in: f64, trim_out: f64) -> Result<(), String> {
    if trim_in < 0.0 || trim_out > 8.0 || trim_in >= trim_out {
        return Err("Invalid trim values".to_string());
    }
    if trim_out - trim_in < 0.5 {
        return Err("Minimum clip duration is 0.5 seconds".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn update_timeline_edit(
    storyboard_id: String,
    shot_id: String,
    trim_in: f64,
    trim_out: f64,
    state: State<'_, DbState>,
) -> Result<TimelineEdit, String> {
    validate_trim_values(trim_in, trim_out)?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id("edit");

    conn.execute(
        "INSERT INTO timeline_edits (id, storyboard_id, shot_id, trim_in, trim_out)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(storyboard_id, shot_id) DO UPDATE SET
           trim_in = excluded.trim_in,
           trim_out = excluded.trim_out,
           updated_at = CURRENT_TIMESTAMP",
        params![id, storyboard_id, shot_id, trim_in, trim_out],
    )
    .map_err(|e| e.to_string())?;

    // Fetch the upserted row
    let mut stmt = conn
        .prepare(
            "SELECT id, storyboard_id, shot_id, trim_in, trim_out, created_at, updated_at
             FROM timeline_edits WHERE storyboard_id = ?1 AND shot_id = ?2",
        )
        .map_err(|e| e.to_string())?;

    let edit = stmt
        .query_row(params![storyboard_id, shot_id], |row| {
            Ok(TimelineEdit {
                id: row.get(0)?,
                storyboard_id: row.get(1)?,
                shot_id: row.get(2)?,
                trim_in: row.get(3)?,
                trim_out: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(edit)
}

#[tauri::command]
pub fn reset_timeline_edit(
    shot_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let changes = conn
        .execute(
            "DELETE FROM timeline_edits WHERE shot_id = ?1",
            params![shot_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

#[tauri::command]
pub fn reset_all_timeline_edits(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let changes = conn
        .execute(
            "DELETE FROM timeline_edits WHERE storyboard_id = ?1",
            params![storyboard_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_trim_values tests --

    #[test]
    fn valid_full_range() {
        assert!(validate_trim_values(0.0, 8.0).is_ok());
    }

    #[test]
    fn valid_middle_range() {
        assert!(validate_trim_values(1.0, 5.0).is_ok());
    }

    #[test]
    fn valid_minimum_duration() {
        assert!(validate_trim_values(0.0, 0.5).is_ok());
    }

    #[test]
    fn invalid_negative_trim_in() {
        assert!(validate_trim_values(-1.0, 5.0).is_err());
    }

    #[test]
    fn invalid_trim_out_exceeds_max() {
        assert!(validate_trim_values(0.0, 9.0).is_err());
    }

    #[test]
    fn invalid_trim_in_equals_trim_out() {
        assert!(validate_trim_values(5.0, 5.0).is_err());
    }

    #[test]
    fn invalid_trim_in_greater_than_trim_out() {
        assert!(validate_trim_values(6.0, 3.0).is_err());
    }

    #[test]
    fn invalid_below_min_duration() {
        let result = validate_trim_values(3.0, 3.4);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Minimum clip duration"));
    }

    #[test]
    fn edge_exactly_minimum_duration() {
        assert!(validate_trim_values(0.0, 0.5).is_ok());
    }

    // -- DB integration tests --

    #[test]
    fn upsert_creates_and_updates() {
        let conn = crate::db::tests::open_test_db();

        let proj_id = crate::db::generate_id("proj");
        conn.execute("INSERT INTO projects (id, name) VALUES (?1, ?2)", params![proj_id, "Test"]).unwrap();
        let sb_id = crate::db::generate_id("sb");
        conn.execute("INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, ?3)", params![sb_id, proj_id, "SB"]).unwrap();
        let shot_id = crate::db::generate_id("shot");
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?1, ?2, 1, 'complete')"#,
            params![shot_id, sb_id],
        ).unwrap();

        // Insert timeline edit
        let edit_id = crate::db::generate_id("edit");
        conn.execute(
            "INSERT INTO timeline_edits (id, storyboard_id, shot_id, trim_in, trim_out) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(storyboard_id, shot_id) DO UPDATE SET trim_in = excluded.trim_in, trim_out = excluded.trim_out",
            params![edit_id, sb_id, shot_id, 1.0, 6.0],
        ).unwrap();

        let (trim_in, trim_out): (f64, f64) = conn.query_row(
            "SELECT trim_in, trim_out FROM timeline_edits WHERE shot_id = ?1",
            params![shot_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(trim_in, 1.0);
        assert_eq!(trim_out, 6.0);

        // Update via upsert
        let edit_id2 = crate::db::generate_id("edit");
        conn.execute(
            "INSERT INTO timeline_edits (id, storyboard_id, shot_id, trim_in, trim_out) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(storyboard_id, shot_id) DO UPDATE SET trim_in = excluded.trim_in, trim_out = excluded.trim_out",
            params![edit_id2, sb_id, shot_id, 2.0, 7.0],
        ).unwrap();

        let (trim_in2, trim_out2): (f64, f64) = conn.query_row(
            "SELECT trim_in, trim_out FROM timeline_edits WHERE shot_id = ?1",
            params![shot_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(trim_in2, 2.0);
        assert_eq!(trim_out2, 7.0);
    }

    #[test]
    fn cascade_delete_on_shot() {
        let conn = crate::db::tests::open_test_db();

        let proj_id = crate::db::generate_id("proj");
        conn.execute("INSERT INTO projects (id, name) VALUES (?1, ?2)", params![proj_id, "Test"]).unwrap();
        let sb_id = crate::db::generate_id("sb");
        conn.execute("INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, ?3)", params![sb_id, proj_id, "SB"]).unwrap();
        let shot_id = crate::db::generate_id("shot");
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?1, ?2, 1, 'complete')"#,
            params![shot_id, sb_id],
        ).unwrap();

        let edit_id = crate::db::generate_id("edit");
        conn.execute(
            "INSERT INTO timeline_edits (id, storyboard_id, shot_id, trim_in, trim_out) VALUES (?1, ?2, ?3, 0.0, 8.0)",
            params![edit_id, sb_id, shot_id],
        ).unwrap();

        // Delete shot — timeline edit should cascade delete
        conn.execute("DELETE FROM shots WHERE id = ?1", params![shot_id]).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM timeline_edits WHERE shot_id = ?1",
            params![shot_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }
}
