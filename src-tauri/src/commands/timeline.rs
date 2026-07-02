use crate::db::{generate_id, DbState};
use rusqlite::params;
use serde::Serialize;
use tauri::State;

// --- Timeline Tracks & Clips ---

#[derive(Debug, Serialize, Clone)]
pub struct TimelineTrack {
    pub id: String,
    pub storyboard_id: String,
    pub track_id: String,
    pub name: String,
    pub track_type: String,
    pub position: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct TimelineClipRow {
    pub id: String,
    pub storyboard_id: String,
    pub shot_id: String,
    pub track_id: String,
    pub start_time: f64,
    /// Trim window in source-file seconds; NULL = untrimmed (full clip)
    pub trim_in: Option<f64>,
    pub trim_out: Option<f64>,
    /// Pinned video version; NULL = follow the shot's current version
    pub video_version_id: Option<String>,
    pub created_at: String,
}

const CLIP_COLUMNS: &str =
    "id, storyboard_id, shot_id, track_id, start_time, trim_in, trim_out, video_version_id, created_at";

fn clip_from_row(row: &rusqlite::Row) -> rusqlite::Result<TimelineClipRow> {
    Ok(TimelineClipRow {
        id: row.get(0)?,
        storyboard_id: row.get(1)?,
        shot_id: row.get(2)?,
        track_id: row.get(3)?,
        start_time: row.get(4)?,
        trim_in: row.get(5)?,
        trim_out: row.get(6)?,
        video_version_id: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn get_clip_by_id(conn: &rusqlite::Connection, id: &str) -> Result<TimelineClipRow, String> {
    conn.query_row(
        &format!("SELECT {CLIP_COLUMNS} FROM timeline_clips WHERE id = ?1"),
        params![id],
        clip_from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => "Clip not found".to_string(),
        other => other.to_string(),
    })
}

/// Validate a clip trim window. Trims are in source-file seconds; the upper
/// bound is the real video duration, which only the frontend knows, so it is
/// clamped there.
pub fn validate_clip_trims(trim_in: f64, trim_out: f64) -> Result<(), String> {
    if trim_in < 0.0 || trim_in >= trim_out {
        return Err("Invalid trim values".to_string());
    }
    if trim_out - trim_in < 0.5 {
        return Err("Minimum clip duration is 0.5 seconds".to_string());
    }
    Ok(())
}

// --- Track Commands ---

fn get_timeline_tracks_db(
    conn: &rusqlite::Connection,
    storyboard_id: &str,
) -> Result<Vec<TimelineTrack>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, storyboard_id, track_id, name, track_type, position, created_at
             FROM timeline_tracks WHERE storyboard_id = ?1 ORDER BY position",
        )
        .map_err(|e| e.to_string())?;

    let tracks = stmt
        .query_map(params![storyboard_id], |row| {
            Ok(TimelineTrack {
                id: row.get(0)?,
                storyboard_id: row.get(1)?,
                track_id: row.get(2)?,
                name: row.get(3)?,
                track_type: row.get(4)?,
                position: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tracks)
}

#[tauri::command]
pub fn get_timeline_tracks(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<TimelineTrack>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_timeline_tracks_db(&conn, &storyboard_id)
}

fn create_timeline_track_db(
    conn: &rusqlite::Connection,
    storyboard_id: &str,
    track_type: &str,
) -> Result<TimelineTrack, String> {
    if track_type != "video" && track_type != "audio" {
        return Err("track_type must be 'video' or 'audio'".to_string());
    }

    let prefix = if track_type == "video" { "V" } else { "A" };

    // Find the next number for this type
    let existing: Vec<String> = conn
        .prepare("SELECT track_id FROM timeline_tracks WHERE storyboard_id = ?1 AND track_type = ?2")
        .map_err(|e| e.to_string())?
        .query_map(params![storyboard_id, track_type], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let max_num = existing
        .iter()
        .filter_map(|tid| tid.strip_prefix(prefix).and_then(|n| n.parse::<i32>().ok()))
        .max()
        .unwrap_or(0);

    let next_num = max_num + 1;
    let track_id = format!("{}{}", prefix, next_num);
    let name = track_id.clone();

    // Position: after all existing tracks of this type
    let max_position: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM timeline_tracks WHERE storyboard_id = ?1",
            params![storyboard_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let position = max_position + 1;
    let id = generate_id("track");

    conn.execute(
        "INSERT INTO timeline_tracks (id, storyboard_id, track_id, name, track_type, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, storyboard_id, track_id, name, track_type, position],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, storyboard_id, track_id, name, track_type, position, created_at
         FROM timeline_tracks WHERE id = ?1",
        params![id],
        |row| {
            Ok(TimelineTrack {
                id: row.get(0)?,
                storyboard_id: row.get(1)?,
                track_id: row.get(2)?,
                name: row.get(3)?,
                track_type: row.get(4)?,
                position: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_timeline_track(
    storyboard_id: String,
    track_type: String,
    state: State<'_, DbState>,
) -> Result<TimelineTrack, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    create_timeline_track_db(&conn, &storyboard_id, &track_type)
}

fn delete_timeline_track_db(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<bool, String> {
    // Get track info
    let track = conn
        .query_row(
            "SELECT storyboard_id, track_type FROM timeline_tracks WHERE id = ?1",
            params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let (storyboard_id, track_type) = track;

    // Refuse to delete the last video track
    if track_type == "video" {
        let video_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM timeline_tracks WHERE storyboard_id = ?1 AND track_type = 'video'",
                params![storyboard_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if video_count <= 1 {
            return Err("Cannot delete the last video track".to_string());
        }
    }

    // Get the track_id for cascade-deleting clips
    let track_id: String = conn
        .query_row(
            "SELECT track_id FROM timeline_tracks WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Delete clips on this track
    conn.execute(
        "DELETE FROM timeline_clips WHERE storyboard_id = ?1 AND track_id = ?2",
        params![storyboard_id, track_id],
    )
    .map_err(|e| e.to_string())?;

    // Delete the track
    let changes = conn
        .execute("DELETE FROM timeline_tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(changes > 0)
}

#[tauri::command]
pub fn delete_timeline_track(
    id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_timeline_track_db(&conn, &id)
}

fn ensure_default_tracks_db(
    conn: &rusqlite::Connection,
    storyboard_id: &str,
) -> Result<Vec<TimelineTrack>, String> {
    let existing = get_timeline_tracks_db(conn, storyboard_id)?;
    if !existing.is_empty() {
        return Ok(existing);
    }

    // Create V1 and A1
    create_timeline_track_db(conn, storyboard_id, "video")?;
    create_timeline_track_db(conn, storyboard_id, "audio")?;

    get_timeline_tracks_db(conn, storyboard_id)
}

#[tauri::command]
pub fn ensure_default_tracks(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<TimelineTrack>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_default_tracks_db(&conn, &storyboard_id)
}

// --- Clip Commands ---

fn get_timeline_clips_db(
    conn: &rusqlite::Connection,
    storyboard_id: &str,
) -> Result<Vec<TimelineClipRow>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {CLIP_COLUMNS} FROM timeline_clips
             WHERE storyboard_id = ?1 ORDER BY track_id, start_time"
        ))
        .map_err(|e| e.to_string())?;

    let clips = stmt
        .query_map(params![storyboard_id], clip_from_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(clips)
}

#[tauri::command]
pub fn get_timeline_clips(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<TimelineClipRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_timeline_clips_db(&conn, &storyboard_id)
}

fn add_timeline_clip_db(
    conn: &rusqlite::Connection,
    storyboard_id: &str,
    shot_id: &str,
    track_id: &str,
    start_time: f64,
    video_version_id: Option<&str>,
) -> Result<TimelineClipRow, String> {
    let id = generate_id("clip");

    conn.execute(
        "INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time, video_version_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, storyboard_id, shot_id, track_id, start_time, video_version_id],
    )
    .map_err(|e| e.to_string())?;

    get_clip_by_id(conn, &id)
}

#[tauri::command]
pub fn add_timeline_clip(
    storyboard_id: String,
    shot_id: String,
    track_id: String,
    start_time: f64,
    video_version_id: Option<String>,
    state: State<'_, DbState>,
) -> Result<TimelineClipRow, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    add_timeline_clip_db(
        &conn,
        &storyboard_id,
        &shot_id,
        &track_id,
        start_time,
        video_version_id.as_deref(),
    )
}

fn update_timeline_clip_trims_db(
    conn: &rusqlite::Connection,
    clip_id: &str,
    trim_in: f64,
    trim_out: f64,
) -> Result<TimelineClipRow, String> {
    validate_clip_trims(trim_in, trim_out)?;

    let changes = conn
        .execute(
            "UPDATE timeline_clips SET trim_in = ?1, trim_out = ?2 WHERE id = ?3",
            params![trim_in, trim_out, clip_id],
        )
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("Clip not found".to_string());
    }
    get_clip_by_id(conn, clip_id)
}

#[tauri::command]
pub fn update_timeline_clip_trims(
    clip_id: String,
    trim_in: f64,
    trim_out: f64,
    state: State<'_, DbState>,
) -> Result<TimelineClipRow, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    update_timeline_clip_trims_db(&conn, &clip_id, trim_in, trim_out)
}

/// Split a clip in two at a point inside its trimmed content. The original
/// keeps [trim_in, split_local_time); a new clip on the same track holds
/// [split_local_time, original trim_out) and starts where the cut lands on
/// the timeline. All values are in source-file seconds except
/// second_start_time. The version pin is copied to the new clip.
fn split_timeline_clip_db(
    conn: &rusqlite::Connection,
    clip_id: &str,
    split_local_time: f64,
    second_start_time: f64,
) -> Result<(TimelineClipRow, TimelineClipRow), String> {
    let original = get_clip_by_id(conn, clip_id)?;

    let first_in = original.trim_in.unwrap_or(0.0);
    validate_clip_trims(first_in, split_local_time)?;
    if let Some(out) = original.trim_out {
        validate_clip_trims(split_local_time, out)?;
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE timeline_clips SET trim_in = ?1, trim_out = ?2 WHERE id = ?3",
        params![first_in, split_local_time, clip_id],
    )
    .map_err(|e| e.to_string())?;

    let second_id = generate_id("clip");
    tx.execute(
        "INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time, trim_in, trim_out, video_version_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            second_id,
            original.storyboard_id,
            original.shot_id,
            original.track_id,
            second_start_time,
            split_local_time,
            original.trim_out,
            original.video_version_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok((get_clip_by_id(conn, clip_id)?, get_clip_by_id(conn, &second_id)?))
}

#[tauri::command]
pub fn split_timeline_clip(
    clip_id: String,
    split_local_time: f64,
    second_start_time: f64,
    state: State<'_, DbState>,
) -> Result<(TimelineClipRow, TimelineClipRow), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    split_timeline_clip_db(&conn, &clip_id, split_local_time, second_start_time)
}

#[tauri::command]
pub fn remove_timeline_clip(
    id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let changes = conn
        .execute("DELETE FROM timeline_clips WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

fn move_timeline_clip_db(
    conn: &rusqlite::Connection,
    clip_id: &str,
    target_track_id: &str,
    start_time: f64,
) -> Result<(), String> {
    let changes = conn
        .execute(
            "UPDATE timeline_clips SET track_id = ?1, start_time = ?2 WHERE id = ?3",
            params![target_track_id, start_time, clip_id],
        )
        .map_err(|e| e.to_string())?;

    if changes == 0 {
        return Err("Clip not found".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn move_timeline_clip(
    clip_id: String,
    target_track_id: String,
    start_time: f64,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    move_timeline_clip_db(&conn, &clip_id, &target_track_id, start_time)
}

#[tauri::command]
pub fn remove_all_timeline_clips(
    storyboard_id: String,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let changes = conn
        .execute(
            "DELETE FROM timeline_clips WHERE storyboard_id = ?1",
            params![storyboard_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_clip_trims tests --

    #[test]
    fn valid_trim_range() {
        assert!(validate_clip_trims(1.0, 5.0).is_ok());
    }

    #[test]
    fn valid_trims_have_no_upper_cap() {
        // Real durations vary per model; the frontend clamps to the file length
        assert!(validate_clip_trims(0.0, 12.0).is_ok());
    }

    #[test]
    fn valid_minimum_duration() {
        assert!(validate_clip_trims(0.0, 0.5).is_ok());
    }

    #[test]
    fn invalid_negative_trim_in() {
        assert!(validate_clip_trims(-1.0, 5.0).is_err());
    }

    #[test]
    fn invalid_reversed_or_equal_trims() {
        assert!(validate_clip_trims(5.0, 5.0).is_err());
        assert!(validate_clip_trims(6.0, 3.0).is_err());
    }

    #[test]
    fn invalid_below_min_duration() {
        let result = validate_clip_trims(3.0, 3.4);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Minimum clip duration"));
    }

    // --- Timeline Tracks & Clips Tests ---

    fn setup_storyboard(conn: &rusqlite::Connection) -> (String, String) {
        let proj_id = crate::db::generate_id("proj");
        conn.execute("INSERT INTO projects (id, name) VALUES (?1, ?2)", params![proj_id, "Test"]).unwrap();
        let sb_id = crate::db::generate_id("sb");
        conn.execute("INSERT INTO storyboards (id, project_id, name) VALUES (?1, ?2, ?3)", params![sb_id, proj_id, "SB"]).unwrap();
        (proj_id, sb_id)
    }

    fn insert_shot(conn: &rusqlite::Connection, sb_id: &str) -> String {
        let shot_id = crate::db::generate_id("shot");
        conn.execute(
            r#"INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?1, ?2, 1, 'complete')"#,
            params![shot_id, sb_id],
        ).unwrap();
        shot_id
    }

    #[test]
    fn ensure_default_tracks_creates_v1_a1() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);

        let tracks = ensure_default_tracks_db(&conn, &sb_id).unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].track_id, "V1");
        assert_eq!(tracks[0].track_type, "video");
        assert_eq!(tracks[1].track_id, "A1");
        assert_eq!(tracks[1].track_type, "audio");
    }

    #[test]
    fn ensure_default_tracks_idempotent() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);

        let tracks1 = ensure_default_tracks_db(&conn, &sb_id).unwrap();
        let tracks2 = ensure_default_tracks_db(&conn, &sb_id).unwrap();
        assert_eq!(tracks1.len(), tracks2.len());
        assert_eq!(tracks1[0].id, tracks2[0].id);
        assert_eq!(tracks1[1].id, tracks2[1].id);
    }

    #[test]
    fn create_track_auto_increments() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);

        let v1 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        let v2 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        let a1 = create_timeline_track_db(&conn, &sb_id, "audio").unwrap();
        let a2 = create_timeline_track_db(&conn, &sb_id, "audio").unwrap();

        assert_eq!(v1.track_id, "V1");
        assert_eq!(v2.track_id, "V2");
        assert_eq!(a1.track_id, "A1");
        assert_eq!(a2.track_id, "A2");
    }

    #[test]
    fn delete_track_refuses_last_video() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);

        let v1 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        let result = delete_timeline_track_db(&conn, &v1.id);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot delete the last video track"));
    }

    #[test]
    fn delete_track_allows_when_multiple_video() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);

        let _v1 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        let v2 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        let result = delete_timeline_track_db(&conn, &v2.id);
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn delete_track_cascades_clips() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let _v1 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        let v2 = create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        add_timeline_clip_db(&conn, &sb_id, &shot_id, &v2.track_id, 0.0, None).unwrap();

        // Verify clip exists
        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips.len(), 1);

        // Delete V2 track
        delete_timeline_track_db(&conn, &v2.id).unwrap();

        // Clips should be gone
        let clips_after = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips_after.len(), 0);
    }

    #[test]
    fn add_and_remove_clip() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let clip = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        assert_eq!(clip.shot_id, shot_id);
        assert_eq!(clip.track_id, "V1");
        assert_eq!(clip.start_time, 0.0);

        // Add another clip
        let shot_id2 = insert_shot(&conn, &sb_id);
        let clip2 = add_timeline_clip_db(&conn, &sb_id, &shot_id2, "V1", 8.0, None).unwrap();
        assert_eq!(clip2.start_time, 8.0);

        // Remove first clip
        let changes = conn.execute("DELETE FROM timeline_clips WHERE id = ?1", params![clip.id]).unwrap();
        assert_eq!(changes, 1);

        let remaining = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, clip2.id);
    }

    #[test]
    fn cascade_delete_storyboard_removes_tracks_and_clips() {
        let conn = crate::db::tests::open_test_db();
        let (_proj_id, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        create_timeline_track_db(&conn, &sb_id, "video").unwrap();
        add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();

        // Delete storyboard
        conn.execute("DELETE FROM storyboards WHERE id = ?1", params![sb_id]).unwrap();

        let tracks = get_timeline_tracks_db(&conn, &sb_id).unwrap();
        assert_eq!(tracks.len(), 0);
        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips.len(), 0);
    }

    #[test]
    fn move_clip_changes_start_time() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let s1 = insert_shot(&conn, &sb_id);

        let c1 = add_timeline_clip_db(&conn, &sb_id, &s1, "V1", 0.0, None).unwrap();
        assert_eq!(c1.start_time, 0.0);

        // Move clip to time 5.5
        move_timeline_clip_db(&conn, &c1.id, "V1", 5.5).unwrap();

        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips[0].start_time, 5.5);
    }

    #[test]
    fn move_clip_cross_track() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let s1 = insert_shot(&conn, &sb_id);

        let c1 = add_timeline_clip_db(&conn, &sb_id, &s1, "V1", 0.0, None).unwrap();

        // Move from V1 to V2 at time 3.0
        move_timeline_clip_db(&conn, &c1.id, "V2", 3.0).unwrap();

        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips[0].track_id, "V2");
        assert_eq!(clips[0].start_time, 3.0);
    }

    #[test]
    fn move_clip_not_found() {
        let conn = crate::db::tests::open_test_db();
        let result = move_timeline_clip_db(&conn, "nonexistent", "V1", 0.0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Clip not found"));
    }

    #[test]
    fn add_clip_with_start_time() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let s1 = insert_shot(&conn, &sb_id);
        let s2 = insert_shot(&conn, &sb_id);

        let c1 = add_timeline_clip_db(&conn, &sb_id, &s1, "V1", 0.0, None).unwrap();
        let c2 = add_timeline_clip_db(&conn, &sb_id, &s2, "V1", 10.0, None).unwrap();

        assert_eq!(c1.start_time, 0.0);
        assert_eq!(c2.start_time, 10.0);

        // Verify ordering
        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips[0].start_time, 0.0);
        assert_eq!(clips[1].start_time, 10.0);
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

        add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();

        // Delete shot — its timeline clips should cascade delete
        conn.execute("DELETE FROM shots WHERE id = ?1", params![shot_id]).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM timeline_clips WHERE shot_id = ?1",
            params![shot_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    // --- Per-clip trims, version pins, split ---

    fn insert_video_version(conn: &rusqlite::Connection, shot_id: &str, n: i64) -> String {
        let version_id = crate::db::generate_id("vver");
        conn.execute(
            "INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
             VALUES (?1, ?2, ?3, 'generation', ?4, 0)",
            params![version_id, shot_id, n, format!("videos/{shot_id}-v{n}.mp4")],
        ).unwrap();
        version_id
    }

    #[test]
    fn new_clips_default_to_untrimmed_and_unpinned() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let clip = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        assert_eq!(clip.trim_in, None);
        assert_eq!(clip.trim_out, None);
        assert_eq!(clip.video_version_id, None);
    }

    #[test]
    fn add_clip_with_pinned_version() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);
        let version_id = insert_video_version(&conn, &shot_id, 2);

        let clip =
            add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, Some(&version_id)).unwrap();
        assert_eq!(clip.video_version_id, Some(version_id));
    }

    #[test]
    fn update_clip_trims_persists() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let clip = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        let updated = update_timeline_clip_trims_db(&conn, &clip.id, 1.5, 6.0).unwrap();
        assert_eq!(updated.trim_in, Some(1.5));
        assert_eq!(updated.trim_out, Some(6.0));

        let fetched = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(fetched[0].trim_in, Some(1.5));
        assert_eq!(fetched[0].trim_out, Some(6.0));
    }

    #[test]
    fn update_clip_trims_rejects_invalid() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let clip = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        assert!(update_timeline_clip_trims_db(&conn, &clip.id, 5.0, 3.0).is_err());
        assert!(update_timeline_clip_trims_db(&conn, "missing", 0.0, 5.0).is_err());
    }

    #[test]
    fn same_shot_twice_with_independent_trims() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let c1 = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        let c2 = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 10.0, None).unwrap();

        update_timeline_clip_trims_db(&conn, &c1.id, 0.0, 3.0).unwrap();
        update_timeline_clip_trims_db(&conn, &c2.id, 4.0, 8.0).unwrap();

        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips[0].trim_out, Some(3.0));
        assert_eq!(clips[1].trim_in, Some(4.0));
    }

    #[test]
    fn split_clip_produces_two_adjacent_pieces() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);
        let version_id = insert_video_version(&conn, &shot_id, 1);

        let clip =
            add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 2.0, Some(&version_id)).unwrap();
        update_timeline_clip_trims_db(&conn, &clip.id, 1.0, 7.0).unwrap();

        // Split 3s into the trimmed content: local time 4.0, timeline time 5.0
        let (first, second) = split_timeline_clip_db(&conn, &clip.id, 4.0, 5.0).unwrap();

        assert_eq!(first.id, clip.id);
        assert_eq!(first.trim_in, Some(1.0));
        assert_eq!(first.trim_out, Some(4.0));
        assert_eq!(first.start_time, 2.0);

        assert_eq!(second.trim_in, Some(4.0));
        assert_eq!(second.trim_out, Some(7.0));
        assert_eq!(second.start_time, 5.0);
        assert_eq!(second.track_id, "V1");
        assert_eq!(second.shot_id, shot_id);
        assert_eq!(second.video_version_id, Some(version_id), "pin copied to second piece");
    }

    #[test]
    fn split_untrimmed_clip_leaves_open_ended_second_piece() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let clip = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        let (first, second) = split_timeline_clip_db(&conn, &clip.id, 3.0, 3.0).unwrap();

        assert_eq!(first.trim_in, Some(0.0));
        assert_eq!(first.trim_out, Some(3.0));
        assert_eq!(second.trim_in, Some(3.0));
        assert_eq!(second.trim_out, None, "second piece runs to the end of the source");
    }

    #[test]
    fn split_rejects_points_too_close_to_edges() {
        let conn = crate::db::tests::open_test_db();
        let (_, sb_id) = setup_storyboard(&conn);
        let shot_id = insert_shot(&conn, &sb_id);

        let clip = add_timeline_clip_db(&conn, &sb_id, &shot_id, "V1", 0.0, None).unwrap();
        update_timeline_clip_trims_db(&conn, &clip.id, 1.0, 7.0).unwrap();

        // First piece would be 0.2s
        assert!(split_timeline_clip_db(&conn, &clip.id, 1.2, 0.2).is_err());
        // Second piece would be 0.3s
        assert!(split_timeline_clip_db(&conn, &clip.id, 6.7, 5.7).is_err());
        // Original untouched
        let clips = get_timeline_clips_db(&conn, &sb_id).unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0].trim_out, Some(7.0));
    }

    #[test]
    fn split_missing_clip_errors() {
        let conn = crate::db::tests::open_test_db();
        let result = split_timeline_clip_db(&conn, "missing", 3.0, 3.0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Clip not found"));
    }
}
