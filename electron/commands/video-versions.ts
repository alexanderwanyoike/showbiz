import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { generateId } from "../db";
import { saveVersionVideo } from "../media-files";

/**
 * Ported video version tree commands; names and JSON shapes match
 * src-tauri/src/commands/video_versions.rs. `mediaDir` is the appDataDir/media
 * path (the Rust command derives it from the AppHandle via
 * media::get_media_base_dir).
 */

export interface VideoVersion {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: string;
  video_path: string;
  prompt: string | null;
  settings_json: string | null;
  model_id: string | null;
  is_current: boolean;
  created_at: string;
  /** Absolute path (media base joined), mirroring Rust make_media_url. */
  video_url: string;
}

export interface VideoVersionNode {
  version: VideoVersion;
  children: VideoVersionNode[];
}

const VERSION_COLUMNS =
  "id, shot_id, parent_version_id, version_number, edit_type, video_path, prompt, settings_json, model_id, is_current, created_at";

interface VersionRow {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: string;
  video_path: string;
  prompt: string | null;
  settings_json: string | null;
  model_id: string | null;
  is_current: number;
  created_at: string;
}

/** Build an absolute file path for a media file, mirroring Rust make_media_url. */
function makeMediaUrl(mediaDir: string, relativePath: string): string {
  return path.join(mediaDir, relativePath);
}

function rowToVersion(row: VersionRow, mediaDir: string): VideoVersion {
  return {
    id: row.id,
    shot_id: row.shot_id,
    parent_version_id: row.parent_version_id,
    version_number: Number(row.version_number),
    edit_type: row.edit_type,
    video_path: row.video_path,
    prompt: row.prompt,
    settings_json: row.settings_json,
    model_id: row.model_id,
    is_current: Number(row.is_current) !== 0,
    created_at: row.created_at,
    video_url: makeMediaUrl(mediaDir, row.video_path),
  };
}

/** Next version number for a shot, mirroring Rust get_next_version_number. */
export function getNextVersionNumber(db: DatabaseSync, shotId: string): number {
  const row = db
    .prepare("SELECT MAX(version_number) AS max_ver FROM video_versions WHERE shot_id = ?")
    .get(shotId) as { max_ver: number | null };
  const max = row?.max_ver;
  return (max == null ? 0 : Number(max)) + 1;
}

/** Build a tree structure from a flat list of video versions, mirroring Rust build_tree. */
export function buildTree(versions: VideoVersion[]): VideoVersionNode[] {
  const nodeMap = new Map<string, VideoVersionNode>();
  for (const version of versions) {
    nodeMap.set(version.id, { version, children: [] });
  }

  const childrenMap = new Map<string, string[]>();
  const rootIds: string[] = [];

  for (const version of versions) {
    const parentId = version.parent_version_id;
    if (parentId != null && nodeMap.has(parentId)) {
      const arr = childrenMap.get(parentId) ?? [];
      arr.push(version.id);
      childrenMap.set(parentId, arr);
    } else {
      rootIds.push(version.id);
    }
  }

  function buildSubtree(nodeId: string): VideoVersionNode {
    const node = nodeMap.get(nodeId)!;
    nodeMap.delete(nodeId);
    const childIds = childrenMap.get(nodeId);
    if (childIds) {
      for (const childId of childIds) {
        node.children.push(buildSubtree(childId));
      }
    }
    return node;
  }

  const roots: VideoVersionNode[] = [];
  for (const rootId of rootIds) {
    if (nodeMap.has(rootId)) {
      roots.push(buildSubtree(rootId));
    }
  }

  return roots;
}

export function createVideoVersionCommands(db: DatabaseSync, mediaDir: string) {
  /** Query a single video version by ID and return it with URL. */
  function queryVersion(versionId: string): VideoVersion | null {
    const row = db
      .prepare(`SELECT ${VERSION_COLUMNS} FROM video_versions WHERE id = ?`)
      .get(versionId) as VersionRow | undefined;
    return row ? rowToVersion(row, mediaDir) : null;
  }

  return {
    get_video_versions(args?: Record<string, unknown>): VideoVersionNode[] {
      const shotId = args!.shotId as string;
      const rows = db
        .prepare(
          `SELECT ${VERSION_COLUMNS} FROM video_versions WHERE shot_id = ? ORDER BY created_at ASC`
        )
        .all(shotId) as unknown as VersionRow[];
      return buildTree(rows.map((row) => rowToVersion(row, mediaDir)));
    },

    get_current_video_version(args?: Record<string, unknown>): VideoVersion | null {
      const shotId = args!.shotId as string;
      const row = db
        .prepare(
          `SELECT ${VERSION_COLUMNS} FROM video_versions WHERE shot_id = ? AND is_current = 1`
        )
        .get(shotId) as VersionRow | undefined;
      return row ? rowToVersion(row, mediaDir) : null;
    },

    switch_to_video_version(args?: Record<string, unknown>): VideoVersion {
      const shotId = args!.shotId as string;
      const versionId = args!.versionId as string;

      // Clear current flag from all video versions of this shot
      db.prepare("UPDATE video_versions SET is_current = 0 WHERE shot_id = ?").run(shotId);

      // Set new current version
      db.prepare(
        "UPDATE video_versions SET is_current = 1 WHERE id = ? AND shot_id = ?"
      ).run(versionId, shotId);

      // Get the version to find its video_path
      const row = db
        .prepare("SELECT video_path FROM video_versions WHERE id = ?")
        .get(versionId) as { video_path: string } | undefined;
      if (!row) {
        // Deviation: Rust surfaces rusqlite's incidental "Query returned no rows"
        // here; no caller matches on the text.
        throw new Error("Version not found");
      }

      // Update shot's video_path and status (do NOT reset the image)
      db.prepare(
        "UPDATE shots SET video_path = ?, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(row.video_path, shotId);

      const version = queryVersion(versionId);
      if (!version) {
        throw new Error("Version not found after update");
      }
      return version;
    },

    get_video_version_count(args?: Record<string, unknown>): number {
      const shotId = args!.shotId as string;
      const { n } = db
        .prepare("SELECT COUNT(*) AS n FROM video_versions WHERE shot_id = ?")
        .get(shotId) as { n: number };
      return Number(n);
    },

    create_video_generation_version(args?: Record<string, unknown>): VideoVersion {
      const shotId = args!.shotId as string;
      const videoData = args!.videoData as number[];
      const mimeType = args!.mimeType as string;
      const prompt = (args!.prompt as string | null | undefined) ?? null;
      const settingsJson = (args!.settingsJson as string | null | undefined) ?? null;
      const modelId = (args!.modelId as string | null | undefined) ?? null;
      const parentVersionId = (args!.parentVersionId as string | null | undefined) ?? null;

      const versionNumber = getNextVersionNumber(db, shotId);
      const videoPath = saveVersionVideo(
        mediaDir,
        shotId,
        versionNumber,
        Buffer.from(videoData),
        mimeType
      );

      const id = generateId("vidver");
      const editType = parentVersionId != null ? "regeneration" : "generation";

      // Clear current flag from all video versions of this shot
      db.prepare("UPDATE video_versions SET is_current = 0 WHERE shot_id = ?").run(shotId);

      // Insert new version as current
      db.prepare(
        `INSERT INTO video_versions (id, shot_id, parent_version_id, version_number, edit_type, video_path, prompt, settings_json, model_id, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        id,
        shotId,
        parentVersionId,
        versionNumber,
        editType,
        videoPath,
        prompt,
        settingsJson,
        modelId
      );

      // Update shot's video_path to the new version and mark complete
      db.prepare(
        "UPDATE shots SET video_path = ?, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(videoPath, shotId);

      const version = queryVersion(id);
      if (!version) {
        throw new Error("Version not found after creation");
      }
      return version;
    },
  };
}
