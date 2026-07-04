import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { generateId } from "../db";
import {
  saveImage,
  saveEndFrame,
  saveVideo,
  saveVideoBlob,
  getImageAsBase64,
  deleteMedia,
  deleteVersionImages,
  deleteMaskImages,
} from "../media-files";

export interface ShotWithUrls {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
  image_prompt: string | null;
  image_path: string | null;
  end_frame_path: string | null;
  video_prompt: string | null;
  video_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  end_frame_url: string | null;
  video_url: string | null;
}

/** Whitelisted, updatable fields, mirroring the Rust `ShotUpdates` struct. */
const UPDATABLE_FIELDS = ["duration", "image_prompt", "video_prompt", "status"] as const;

interface ShotRow {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
  image_prompt: string | null;
  image_path: string | null;
  end_frame_path: string | null;
  video_prompt: string | null;
  video_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const SHOT_COLUMNS = `id, storyboard_id, "order", duration, image_prompt, image_path,
                      end_frame_path, video_prompt, video_path, status, created_at, updated_at`;

/** Ported shot commands; names and JSON shapes match the retired Rust backend's commands/shots.rs. */
export function createShotCommands(db: DatabaseSync, mediaDir: string) {
  /**
   * Build an absolute file path for a media file, mirroring Rust make_media_url
   * (media base dir joined onto the relative DB path). Cache-busting timestamps
   * are added on the TypeScript side via convertFileSrc.
   */
  function makeMediaUrl(relativePath: string | null): string | null {
    return relativePath === null ? null : path.join(mediaDir, relativePath);
  }

  function rowToShot(row: ShotRow): ShotWithUrls {
    return {
      id: row.id,
      storyboard_id: row.storyboard_id,
      order: row.order,
      duration: row.duration,
      image_prompt: row.image_prompt,
      image_path: row.image_path,
      end_frame_path: row.end_frame_path,
      video_prompt: row.video_prompt,
      video_path: row.video_path,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      image_url: makeMediaUrl(row.image_path),
      end_frame_url: makeMediaUrl(row.end_frame_path),
      video_url: makeMediaUrl(row.video_path),
    };
  }

  /** Query a single shot and return it with URLs resolved. */
  function queryShotWithUrls(shotId: string): ShotWithUrls {
    const row = db
      .prepare(`SELECT ${SHOT_COLUMNS} FROM shots WHERE id = ?`)
      .get(shotId) as ShotRow | undefined;
    if (!row) {
      // Deliberate deviation: Rust's query_row surfaces rusqlite's incidental
      // "Query returned no rows" here; no caller matches on the text.
      throw new Error("Shot not found");
    }
    return rowToShot(row);
  }

  function getShots(storyboardId: string): ShotWithUrls[] {
    const rows = db
      .prepare(`SELECT ${SHOT_COLUMNS} FROM shots WHERE storyboard_id = ? ORDER BY "order" ASC`)
      .all(storyboardId) as unknown as ShotRow[];
    return rows.map(rowToShot);
  }

  function createShot(storyboardId: string): ShotWithUrls {
    const id = generateId("shot");

    const { next_order: nextOrder } = db
      .prepare(
        `SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM shots WHERE storyboard_id = ?`
      )
      .get(storyboardId) as { next_order: number };

    db.prepare(`INSERT INTO shots (id, storyboard_id, "order") VALUES (?, ?, ?)`).run(
      id,
      storyboardId,
      nextOrder
    );

    return queryShotWithUrls(id);
  }

  function updateShot(id: string, updatesJson: string): ShotWithUrls {
    let updates: Record<string, unknown>;
    try {
      const parsed = JSON.parse(updatesJson);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("expected a JSON object");
      }
      updates = parsed as Record<string, unknown>;
    } catch (e) {
      throw new Error(`Invalid updates JSON: ${e instanceof Error ? e.message : String(e)}`);
    }

    const setClauses: string[] = [];
    const paramValues: unknown[] = [];

    for (const field of UPDATABLE_FIELDS) {
      // Mirror serde's Option semantics: an absent or null field is skipped.
      const value = updates[field];
      if (value !== undefined && value !== null) {
        setClauses.push(`${field} = ?`);
        paramValues.push(value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = CURRENT_TIMESTAMP");
      paramValues.push(id);
      const sql = `UPDATE shots SET ${setClauses.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...(paramValues as never[]));
    }

    return queryShotWithUrls(id);
  }

  function deleteShot(id: string): boolean {
    const shot = db
      .prepare("SELECT image_path, end_frame_path, video_path FROM shots WHERE id = ?")
      .get(id) as
      | { image_path: string | null; end_frame_path: string | null; video_path: string | null }
      | undefined;

    if (shot) {
      if (shot.image_path) deleteMedia(mediaDir, shot.image_path);
      if (shot.end_frame_path) deleteMedia(mediaDir, shot.end_frame_path);
      if (shot.video_path) deleteMedia(mediaDir, shot.video_path);
    }

    deleteVersionImages(mediaDir, id);
    deleteMaskImages(mediaDir, id);

    const { changes } = db.prepare("DELETE FROM shots WHERE id = ?").run(id);
    return Number(changes) > 0;
  }

  function reorderShots(storyboardId: string, shotIds: string[]): void {
    db.exec("BEGIN");
    try {
      const stmt = db.prepare(
        `UPDATE shots SET "order" = ? WHERE id = ? AND storyboard_id = ?`
      );
      shotIds.forEach((shotId, index) => {
        stmt.run(index + 1, shotId, storyboardId);
      });
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  function saveShotImage(id: string, base64DataUrl: string, prompt: string): ShotWithUrls {
    const existing = db
      .prepare("SELECT image_path, video_path FROM shots WHERE id = ?")
      .get(id) as { image_path: string | null; video_path: string | null } | undefined;

    if (existing) {
      if (existing.image_path) deleteMedia(mediaDir, existing.image_path);
      if (existing.video_path) deleteMedia(mediaDir, existing.video_path);
    }

    const imagePath = saveImage(mediaDir, id, base64DataUrl);

    db.prepare(
      "UPDATE shots SET image_path = ?, image_prompt = ?, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(imagePath, prompt, id);

    return queryShotWithUrls(id);
  }

  function saveShotEndFrame(id: string, base64DataUrl: string): ShotWithUrls {
    const oldEndFrame = (
      db.prepare("SELECT end_frame_path FROM shots WHERE id = ?").get(id) as
        | { end_frame_path: string | null }
        | undefined
    )?.end_frame_path;

    if (oldEndFrame) deleteMedia(mediaDir, oldEndFrame);

    const endFramePath = saveEndFrame(mediaDir, id, base64DataUrl);

    db.prepare(
      "UPDATE shots SET end_frame_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(endFramePath, id);

    return queryShotWithUrls(id);
  }

  function clearShotEndFrame(id: string): ShotWithUrls {
    const oldEndFrame = (
      db.prepare("SELECT end_frame_path FROM shots WHERE id = ?").get(id) as
        | { end_frame_path: string | null }
        | undefined
    )?.end_frame_path;

    if (oldEndFrame) deleteMedia(mediaDir, oldEndFrame);

    db.prepare(
      "UPDATE shots SET end_frame_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(id);

    return queryShotWithUrls(id);
  }

  function saveShotVideo(id: string, base64DataUrl: string): ShotWithUrls {
    const oldVideo = (
      db.prepare("SELECT video_path FROM shots WHERE id = ?").get(id) as
        | { video_path: string | null }
        | undefined
    )?.video_path;

    if (oldVideo) deleteMedia(mediaDir, oldVideo);

    const videoPath = saveVideo(mediaDir, id, base64DataUrl);

    db.prepare(
      "UPDATE shots SET video_path = ?, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(videoPath, id);

    return queryShotWithUrls(id);
  }

  function getShotImageBase64(shotId: string): string | null {
    const imagePath = (
      db.prepare("SELECT image_path FROM shots WHERE id = ?").get(shotId) as
        | { image_path: string | null }
        | undefined
    )?.image_path;

    return imagePath ? getImageAsBase64(mediaDir, imagePath) : null;
  }

  function getShotEndFrameBase64(shotId: string): string | null {
    const endFramePath = (
      db.prepare("SELECT end_frame_path FROM shots WHERE id = ?").get(shotId) as
        | { end_frame_path: string | null }
        | undefined
    )?.end_frame_path;

    return endFramePath ? getImageAsBase64(mediaDir, endFramePath) : null;
  }

  function copyImageFromShot(targetShotId: string, sourceShotId: string): ShotWithUrls {
    const source = db
      .prepare(`SELECT image_path, image_prompt, "order" AS source_order FROM shots WHERE id = ?`)
      .get(sourceShotId) as
      | { image_path: string | null; image_prompt: string | null; source_order: number }
      | undefined;

    if (!source) {
      throw new Error("Source shot not found");
    }

    const sourceImagePath = source.image_path;
    if (!sourceImagePath) {
      throw new Error("Source shot has no image");
    }

    const imageBase64 = getImageAsBase64(mediaDir, sourceImagePath);
    if (imageBase64 === null) {
      throw new Error("Failed to read source image");
    }

    const target = db
      .prepare("SELECT image_path, video_path FROM shots WHERE id = ?")
      .get(targetShotId) as
      | { image_path: string | null; video_path: string | null }
      | undefined;

    if (target) {
      if (target.image_path) deleteMedia(mediaDir, target.image_path);
      if (target.video_path) deleteMedia(mediaDir, target.video_path);
    }

    const imagePath = saveImage(mediaDir, targetShotId, imageBase64);

    // Rust builds the same string on both map branches; the prompt is always set.
    const promptText = `Copied from Shot #${source.source_order}`;

    db.prepare(
      "UPDATE shots SET image_path = ?, image_prompt = ?, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(imagePath, promptText, targetShotId);

    return queryShotWithUrls(targetShotId);
  }

  function saveAndCompleteVideo(
    shotId: string,
    videoData: number[],
    mimeType: string
  ): ShotWithUrls {
    const oldVideo = (
      db.prepare("SELECT video_path FROM shots WHERE id = ?").get(shotId) as
        | { video_path: string | null }
        | undefined
    )?.video_path;

    if (oldVideo) deleteMedia(mediaDir, oldVideo);

    const videoPath = saveVideoBlob(mediaDir, shotId, Uint8Array.from(videoData), mimeType);

    db.prepare(
      "UPDATE shots SET video_path = ?, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(videoPath, shotId);

    return queryShotWithUrls(shotId);
  }

  return {
    get_shots(args?: Record<string, unknown>): ShotWithUrls[] {
      return getShots(args!.storyboardId as string);
    },
    create_shot(args?: Record<string, unknown>): ShotWithUrls {
      return createShot(args!.storyboardId as string);
    },
    update_shot(args?: Record<string, unknown>): ShotWithUrls {
      return updateShot(args!.id as string, args!.updatesJson as string);
    },
    delete_shot(args?: Record<string, unknown>): boolean {
      return deleteShot(args!.id as string);
    },
    reorder_shots(args?: Record<string, unknown>): void {
      return reorderShots(args!.storyboardId as string, args!.shotIds as string[]);
    },
    save_shot_image(args?: Record<string, unknown>): ShotWithUrls {
      return saveShotImage(
        args!.id as string,
        args!.base64DataUrl as string,
        args!.prompt as string
      );
    },
    save_shot_end_frame(args?: Record<string, unknown>): ShotWithUrls {
      return saveShotEndFrame(args!.id as string, args!.base64DataUrl as string);
    },
    clear_shot_end_frame(args?: Record<string, unknown>): ShotWithUrls {
      return clearShotEndFrame(args!.id as string);
    },
    save_shot_video(args?: Record<string, unknown>): ShotWithUrls {
      return saveShotVideo(args!.id as string, args!.base64DataUrl as string);
    },
    get_shot_image_base64(args?: Record<string, unknown>): string | null {
      return getShotImageBase64(args!.shotId as string);
    },
    get_shot_end_frame_base64(args?: Record<string, unknown>): string | null {
      return getShotEndFrameBase64(args!.shotId as string);
    },
    copy_image_from_shot(args?: Record<string, unknown>): ShotWithUrls {
      return copyImageFromShot(
        args!.targetShotId as string,
        args!.sourceShotId as string
      );
    },
    save_and_complete_video(args?: Record<string, unknown>): ShotWithUrls {
      return saveAndCompleteVideo(
        args!.shotId as string,
        args!.videoData as number[],
        args!.mimeType as string
      );
    },
  };
}
