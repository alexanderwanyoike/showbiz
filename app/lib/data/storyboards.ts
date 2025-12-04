import { db } from "../db";
import { ImageModelId, VideoModelId } from "../models";

export interface Storyboard {
  id: string;
  project_id: string;
  name: string;
  image_model: ImageModelId;
  video_model: VideoModelId;
  created_at: string;
  updated_at: string;
}

export function getStoryboardsByProject(projectId: string): Storyboard[] {
  const stmt = db.prepare(
    "SELECT * FROM storyboards WHERE project_id = ? ORDER BY updated_at DESC"
  );
  return stmt.all(projectId) as Storyboard[];
}

export function getStoryboardById(id: string): Storyboard | null {
  const stmt = db.prepare("SELECT * FROM storyboards WHERE id = ?");
  return (stmt.get(id) as Storyboard) || null;
}

export function createStoryboard(
  id: string,
  projectId: string,
  name: string
): Storyboard {
  const stmt = db.prepare(
    "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?) RETURNING *"
  );
  return stmt.get(id, projectId, name) as Storyboard;
}

export function updateStoryboard(id: string, name: string): Storyboard | null {
  const stmt = db.prepare(
    "UPDATE storyboards SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *"
  );
  return (stmt.get(name, id) as Storyboard) || null;
}

export function deleteStoryboard(id: string): boolean {
  const stmt = db.prepare("DELETE FROM storyboards WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function updateStoryboardModels(
  id: string,
  imageModel: ImageModelId,
  videoModel: VideoModelId
): Storyboard | null {
  const stmt = db.prepare(
    "UPDATE storyboards SET image_model = ?, video_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *"
  );
  return (stmt.get(imageModel, videoModel, id) as Storyboard) || null;
}

export interface StoryboardWithPreview extends Storyboard {
  preview_image_path: string | null;
}

export function getStoryboardsWithPreview(projectId: string): StoryboardWithPreview[] {
  const stmt = db.prepare(`
    SELECT
      s.*,
      (
        SELECT sh.image_path
        FROM shots sh
        WHERE sh.storyboard_id = s.id AND sh.image_path IS NOT NULL
        ORDER BY sh."order" ASC
        LIMIT 1
      ) as preview_image_path
    FROM storyboards s
    WHERE s.project_id = ?
    ORDER BY s.updated_at DESC
  `);
  return stmt.all(projectId) as StoryboardWithPreview[];
}
