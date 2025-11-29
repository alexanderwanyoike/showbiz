import { db } from "../db";

export interface TimelineEdit {
  id: string;
  storyboard_id: string;
  shot_id: string;
  trim_in: number;
  trim_out: number;
  created_at: string;
  updated_at: string;
}

export function getTimelineEditsByStoryboard(storyboardId: string): TimelineEdit[] {
  const stmt = db.prepare(
    "SELECT * FROM timeline_edits WHERE storyboard_id = ?"
  );
  return stmt.all(storyboardId) as TimelineEdit[];
}

export function getTimelineEditByShot(shotId: string): TimelineEdit | null {
  const stmt = db.prepare("SELECT * FROM timeline_edits WHERE shot_id = ?");
  return (stmt.get(shotId) as TimelineEdit) || null;
}

export function upsertTimelineEdit(
  storyboardId: string,
  shotId: string,
  trimIn: number,
  trimOut: number
): TimelineEdit {
  const id = `edit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const stmt = db.prepare(`
    INSERT INTO timeline_edits (id, storyboard_id, shot_id, trim_in, trim_out)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(storyboard_id, shot_id) DO UPDATE SET
      trim_in = excluded.trim_in,
      trim_out = excluded.trim_out,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `);

  return stmt.get(id, storyboardId, shotId, trimIn, trimOut) as TimelineEdit;
}

export function deleteTimelineEdit(shotId: string): boolean {
  const stmt = db.prepare("DELETE FROM timeline_edits WHERE shot_id = ?");
  const result = stmt.run(shotId);
  return result.changes > 0;
}

export function deleteTimelineEditsByStoryboard(storyboardId: string): boolean {
  const stmt = db.prepare("DELETE FROM timeline_edits WHERE storyboard_id = ?");
  const result = stmt.run(storyboardId);
  return result.changes > 0;
}
