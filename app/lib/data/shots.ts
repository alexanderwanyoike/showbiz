import { db } from "../db";

export type ShotStatus = "pending" | "generating" | "complete" | "failed";

export interface Shot {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
  image_prompt: string | null;
  image_path: string | null;
  video_prompt: string | null;
  video_path: string | null;
  status: ShotStatus;
  created_at: string;
  updated_at: string;
}

export function getShotsByStoryboard(storyboardId: string): Shot[] {
  const stmt = db.prepare(
    'SELECT * FROM shots WHERE storyboard_id = ? ORDER BY "order" ASC'
  );
  return stmt.all(storyboardId) as Shot[];
}

export function getShotById(id: string): Shot | null {
  const stmt = db.prepare("SELECT * FROM shots WHERE id = ?");
  return (stmt.get(id) as Shot) || null;
}

export function createShot(
  id: string,
  storyboardId: string,
  order: number
): Shot {
  const stmt = db.prepare(
    'INSERT INTO shots (id, storyboard_id, "order") VALUES (?, ?, ?) RETURNING *'
  );
  return stmt.get(id, storyboardId, order) as Shot;
}

export function updateShot(
  id: string,
  updates: Partial<Omit<Shot, "id" | "storyboard_id" | "created_at" | "updated_at">>
): Shot | null {
  const allowedFields = [
    "order",
    "duration",
    "image_prompt",
    "image_path",
    "video_prompt",
    "video_path",
    "status",
  ];

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`"${key}" = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return getShotById(id);

  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const sql = `UPDATE shots SET ${setClauses.join(", ")} WHERE id = ? RETURNING *`;
  const stmt = db.prepare(sql);
  return (stmt.get(...values) as Shot) || null;
}

export function deleteShot(id: string): boolean {
  const stmt = db.prepare("DELETE FROM shots WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function reorderShots(storyboardId: string, shotIds: string[]): void {
  const updateStmt = db.prepare('UPDATE shots SET "order" = ? WHERE id = ?');

  const transaction = db.transaction(() => {
    shotIds.forEach((shotId, index) => {
      updateStmt.run(index + 1, shotId);
    });
  });

  transaction();
}

export function getNextShotOrder(storyboardId: string): number {
  const stmt = db.prepare(
    'SELECT MAX("order") as max_order FROM shots WHERE storyboard_id = ?'
  );
  const result = stmt.get(storyboardId) as { max_order: number | null };
  return (result.max_order || 0) + 1;
}
