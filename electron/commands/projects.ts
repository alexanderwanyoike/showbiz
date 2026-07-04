import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { generateId } from "../db";
import {
  deleteBibleMedia,
  deleteMaskImages,
  deleteMedia,
  deleteVersionImages,
} from "../media-files";

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Storyboard {
  id: string;
  project_id: string;
  name: string;
  image_model: string;
  video_model: string;
  created_at: string;
  updated_at: string;
}

export interface StoryboardWithPreview extends Storyboard {
  preview_image_path: string | null;
}

const PROJECT_COLUMNS = "id, name, created_at, updated_at";
const STORYBOARD_COLUMNS =
  "id, project_id, name, image_model, video_model, created_at, updated_at";

/**
 * Ported project + storyboard commands; names and JSON shapes match
 * the retired Rust backend's commands/projects.rs. `mediaDir` is the appDataDir/media path,
 * needed to delete a project's/storyboard's media files on cascade delete (the
 * Rust commands derive it from the AppHandle).
 */
export function createProjectCommands(db: DatabaseSync, mediaDir: string) {
  function getProject(id: string): Project | null {
    const row = db
      .prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`)
      .get(id);
    return (row as Project | undefined) ?? null;
  }

  function getStoryboard(id: string): Storyboard | null {
    const row = db
      .prepare(`SELECT ${STORYBOARD_COLUMNS} FROM storyboards WHERE id = ?`)
      .get(id);
    return (row as Storyboard | undefined) ?? null;
  }

  /** Delete the media files owned by a set of shots (start frame, video, version images, masks). */
  function deleteShotMedia(shotIds: string[]): void {
    for (const shotId of shotIds) {
      const shot = db
        .prepare("SELECT image_path, video_path FROM shots WHERE id = ?")
        .get(shotId) as
        | { image_path: string | null; video_path: string | null }
        | undefined;
      if (shot?.image_path) {
        deleteMedia(mediaDir, shot.image_path);
      }
      if (shot?.video_path) {
        deleteMedia(mediaDir, shot.video_path);
      }
      deleteVersionImages(mediaDir, shotId);
      deleteMaskImages(mediaDir, shotId);
    }
  }

  return {
    get_project(args?: Record<string, unknown>): Project | null {
      return getProject(args!.id as string);
    },

    get_projects(): Project[] {
      return db
        .prepare(
          `SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY updated_at DESC`
        )
        .all() as unknown as Project[];
    },

    create_project(args?: Record<string, unknown>): Project {
      const id = generateId("proj");
      db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(
        id,
        args!.name as string
      );
      // Re-select so created_at/updated_at come from SQLite, matching the Rust command.
      return getProject(id)!;
    },

    update_project(args?: Record<string, unknown>): Project {
      const id = args!.id as string;
      db.prepare(
        "UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(args!.name as string, id);
      return getProject(id)!;
    },

    delete_project(args?: Record<string, unknown>): boolean {
      const id = args!.id as string;

      const storyboardIds = (
        db
          .prepare("SELECT id FROM storyboards WHERE project_id = ?")
          .all(id) as { id: string }[]
      ).map((row) => row.id);

      for (const storyboardId of storyboardIds) {
        const shotIds = (
          db
            .prepare("SELECT id FROM shots WHERE storyboard_id = ?")
            .all(storyboardId) as { id: string }[]
        ).map((row) => row.id);
        deleteShotMedia(shotIds);
      }

      const bibleIds = (
        db
          .prepare("SELECT id FROM bibles WHERE project_id = ?")
          .all(id) as { id: string }[]
      ).map((row) => row.id);
      for (const bibleId of bibleIds) {
        deleteBibleMedia(mediaDir, bibleId);
      }

      // Delete the project (cascades to storyboards and shots).
      const { changes } = db
        .prepare("DELETE FROM projects WHERE id = ?")
        .run(id);
      return changes > 0;
    },

    get_storyboards(args?: Record<string, unknown>): Storyboard[] {
      return db
        .prepare(
          `SELECT ${STORYBOARD_COLUMNS} FROM storyboards
           WHERE project_id = ? ORDER BY updated_at DESC`
        )
        .all(args!.projectId as string) as unknown as Storyboard[];
    },

    get_storyboards_with_preview(
      args?: Record<string, unknown>
    ): StoryboardWithPreview[] {
      const rows = db
        .prepare(
          `SELECT
             s.id, s.project_id, s.name, s.image_model, s.video_model, s.created_at, s.updated_at,
             (
               SELECT sh.image_path
               FROM shots sh
               WHERE sh.storyboard_id = s.id AND sh.image_path IS NOT NULL
               ORDER BY sh."order" ASC
               LIMIT 1
             ) as preview_image_path
           FROM storyboards s
           WHERE s.project_id = ?
           ORDER BY s.updated_at DESC`
        )
        .all(args!.projectId as string) as unknown as (Storyboard & {
        preview_image_path: string | null;
      })[];

      return rows.map((row) => ({
        ...row,
        // Absolute path (media base dir joined onto the relative DB path); null when no shot has an image.
        preview_image_path: row.preview_image_path
          ? path.join(mediaDir, row.preview_image_path)
          : null,
      }));
    },

    get_storyboard(args?: Record<string, unknown>): Storyboard | null {
      return getStoryboard(args!.id as string);
    },

    create_storyboard(args?: Record<string, unknown>): Storyboard {
      const id = generateId("sb");
      db.prepare(
        "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
      ).run(id, args!.projectId as string, args!.name as string);
      // Re-select so defaults + timestamps come from SQLite, matching the Rust command.
      return getStoryboard(id)!;
    },

    update_storyboard(args?: Record<string, unknown>): Storyboard {
      const id = args!.id as string;
      db.prepare(
        "UPDATE storyboards SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(args!.name as string, id);
      return getStoryboard(id)!;
    },

    delete_storyboard(args?: Record<string, unknown>): boolean {
      const id = args!.id as string;

      const shotIds = (
        db
          .prepare("SELECT id FROM shots WHERE storyboard_id = ?")
          .all(id) as { id: string }[]
      ).map((row) => row.id);
      deleteShotMedia(shotIds);

      // Delete the storyboard (cascades to shots).
      const { changes } = db
        .prepare("DELETE FROM storyboards WHERE id = ?")
        .run(id);
      return changes > 0;
    },

    update_storyboard_models(args?: Record<string, unknown>): Storyboard {
      const id = args!.id as string;
      db.prepare(
        "UPDATE storyboards SET image_model = ?, video_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(args!.imageModel as string, args!.videoModel as string, id);
      return getStoryboard(id)!;
    },
  };
}
