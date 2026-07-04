import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { generateId } from "../db";
import { getImageAsBase64, saveVersionImage } from "../media-files";

/**
 * Ported image-version-tree commands; names, argument keys and JSON shapes
 * match the retired Rust backend's commands/image_versions.rs. The Rust commands derive the
 * media base dir from an AppHandle; here it is passed in explicitly
 * (appDataDir/media) so the module stays pure and testable.
 */

/**
 * One image version. Mirrors the Rust ImageVersion struct, including the
 * optional image_url/mask_url that Rust fills with absolute media paths.
 * (tauri-api.ts splits this into ImageVersion + ImageVersionWithUrl, but Rust
 * serializes a single struct, so image_url is always present here.)
 */
export interface ImageVersion {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: string;
  image_path: string;
  prompt: string | null;
  edit_prompt: string | null;
  mask_path: string | null;
  is_current: boolean;
  created_at: string;
  image_url: string | null;
  mask_url: string | null;
}

export interface ImageVersionNode {
  version: ImageVersion;
  children: ImageVersionNode[];
}

/** Row shape as returned by node:sqlite (is_current comes back as 0/1). */
interface ImageVersionRow {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: string;
  image_path: string;
  prompt: string | null;
  edit_prompt: string | null;
  mask_path: string | null;
  is_current: number;
  created_at: string;
}

const SELECT_COLUMNS =
  "id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current, created_at";

/**
 * Build an absolute file path for a media file. Cache-busting timestamps are
 * added on the TypeScript side via convertFileSrc. Mirrors Rust make_media_url.
 */
function makeMediaUrl(mediaDir: string, relativePath: string): string {
  return path.join(mediaDir, relativePath);
}

/** Map a raw DB row into an ImageVersion with absolute media URLs. */
function rowToVersion(row: ImageVersionRow, mediaDir: string): ImageVersion {
  return {
    id: row.id,
    shot_id: row.shot_id,
    parent_version_id: row.parent_version_id,
    version_number: row.version_number,
    edit_type: row.edit_type,
    image_path: row.image_path,
    prompt: row.prompt,
    edit_prompt: row.edit_prompt,
    mask_path: row.mask_path,
    is_current: row.is_current !== 0,
    created_at: row.created_at,
    image_url: makeMediaUrl(mediaDir, row.image_path),
    mask_url: row.mask_path === null ? null : makeMediaUrl(mediaDir, row.mask_path),
  };
}

/**
 * Build a tree structure from a flat list of versions. Mirrors Rust build_tree:
 * roots and children preserve the input order (created_at ASC for the query),
 * and a version whose parent is absent from the list is treated as a root.
 */
export function buildTree(versions: ImageVersion[]): ImageVersionNode[] {
  const present = new Set(versions.map((v) => v.id));
  const childrenMap = new Map<string, ImageVersion[]>();
  const roots: ImageVersion[] = [];

  for (const version of versions) {
    const parentId = version.parent_version_id;
    if (parentId !== null && present.has(parentId)) {
      const bucket = childrenMap.get(parentId);
      if (bucket) {
        bucket.push(version);
      } else {
        childrenMap.set(parentId, [version]);
      }
    } else {
      // No parent, or parent was deleted: treat as a root.
      roots.push(version);
    }
  }

  function buildSubtree(version: ImageVersion): ImageVersionNode {
    const children = (childrenMap.get(version.id) ?? []).map(buildSubtree);
    return { version, children };
  }

  return roots.map(buildSubtree);
}

/** Get next version number for a shot (max + 1, defaulting to 1). */
function getNextVersionNumber(db: DatabaseSync, shotId: string): number {
  const row = db
    .prepare("SELECT MAX(version_number) AS max_ver FROM image_versions WHERE shot_id = ?")
    .get(shotId) as { max_ver: number | null };
  return (row.max_ver ?? 0) + 1;
}

/** Query a single image version by ID and return it with URLs, or null. */
function queryVersion(
  db: DatabaseSync,
  mediaDir: string,
  versionId: string
): ImageVersion | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM image_versions WHERE id = ?`)
    .get(versionId) as ImageVersionRow | undefined;
  return row ? rowToVersion(row, mediaDir) : null;
}

export function createImageVersionCommands(db: DatabaseSync, mediaDir: string) {
  function getImageVersions(shotId: string): ImageVersionNode[] {
    const rows = db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM image_versions WHERE shot_id = ? ORDER BY created_at ASC`
      )
      .all(shotId) as unknown as ImageVersionRow[];
    return buildTree(rows.map((row) => rowToVersion(row, mediaDir)));
  }

  function switchToVersion(shotId: string, versionId: string): ImageVersion {
    // Clear current flag from all versions of this shot.
    db.prepare("UPDATE image_versions SET is_current = 0 WHERE shot_id = ?").run(shotId);

    // Set new current version.
    db.prepare(
      "UPDATE image_versions SET is_current = 1 WHERE id = ? AND shot_id = ?"
    ).run(versionId, shotId);

    // Get the version to find its image_path and prompt.
    const target = db
      .prepare("SELECT image_path, prompt FROM image_versions WHERE id = ?")
      .get(versionId) as { image_path: string; prompt: string | null } | undefined;
    if (!target) {
      // Deliberate deviation: Rust surfaces rusqlite's incidental
      // "Query returned no rows" here; no caller matches on the text.
      throw new Error("Version not found");
    }

    // Update shot's image_path, reset video.
    db.prepare(
      "UPDATE shots SET image_path = ?, image_prompt = ?, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(target.image_path, target.prompt, shotId);

    const version = queryVersion(db, mediaDir, versionId);
    if (!version) {
      throw new Error("Version not found after update");
    }
    return version;
  }

  function createGenerationVersion(
    shotId: string,
    prompt: string,
    imageBase64: string,
    parentVersionId: string | null
  ): ImageVersion {
    const versionNumber = getNextVersionNumber(db, shotId);
    const imagePath = saveVersionImage(mediaDir, shotId, versionNumber, imageBase64);

    const id = generateId("imgver");
    const editType = parentVersionId !== null ? "regeneration" : "generation";

    // Clear current flag from all versions of this shot.
    db.prepare("UPDATE image_versions SET is_current = 0 WHERE shot_id = ?").run(shotId);

    // Insert new version as current.
    db.prepare(
      `INSERT INTO image_versions (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1)`
    ).run(id, shotId, parentVersionId, versionNumber, editType, imagePath, prompt);

    // Update shot's image_path to the new version, reset video.
    db.prepare(
      "UPDATE shots SET image_path = ?, image_prompt = ?, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(imagePath, prompt, shotId);

    const version = queryVersion(db, mediaDir, id);
    if (!version) {
      throw new Error("Version not found after creation");
    }
    return version;
  }

  function createRemixVersion(
    shotId: string,
    parentVersionId: string,
    editPrompt: string,
    resultImageBase64: string
  ): ImageVersion {
    // Get parent version's prompt.
    const parent = db
      .prepare("SELECT prompt FROM image_versions WHERE id = ?")
      .get(parentVersionId) as { prompt: string | null } | undefined;
    const parentPrompt = parent ? parent.prompt : null;

    const versionNumber = getNextVersionNumber(db, shotId);
    const imagePath = saveVersionImage(mediaDir, shotId, versionNumber, resultImageBase64);

    const id = generateId("imgver");

    // Clear current flag from all versions of this shot.
    db.prepare("UPDATE image_versions SET is_current = 0 WHERE shot_id = ?").run(shotId);

    // Insert new version as current.
    db.prepare(
      `INSERT INTO image_versions (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current)
       VALUES (?, ?, ?, ?, 'remix', ?, ?, ?, NULL, 1)`
    ).run(id, shotId, parentVersionId, versionNumber, imagePath, parentPrompt, editPrompt);

    // Update shot's image_path to the new version, reset video.
    db.prepare(
      "UPDATE shots SET image_path = ?, image_prompt = ?, video_path = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(imagePath, editPrompt, shotId);

    const version = queryVersion(db, mediaDir, id);
    if (!version) {
      throw new Error("Version not found after creation");
    }
    return version;
  }

  function getVersionImageBase64(versionId: string): string | null {
    const row = db
      .prepare("SELECT image_path FROM image_versions WHERE id = ?")
      .get(versionId) as { image_path: string } | undefined;
    if (!row) {
      return null;
    }
    return getImageAsBase64(mediaDir, row.image_path);
  }

  function deleteVersion(versionId: string): boolean {
    const { changes } = db
      .prepare("DELETE FROM image_versions WHERE id = ?")
      .run(versionId);
    return Number(changes) > 0;
  }

  function getVersionCount(shotId: string): number {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM image_versions WHERE shot_id = ?")
      .get(shotId) as { n: number };
    return row.n;
  }

  return {
    get_image_versions(args?: Record<string, unknown>): ImageVersionNode[] {
      return getImageVersions(args!.shotId as string);
    },
    switch_to_version(args?: Record<string, unknown>): ImageVersion {
      return switchToVersion(args!.shotId as string, args!.versionId as string);
    },
    create_generation_version(args?: Record<string, unknown>): ImageVersion {
      return createGenerationVersion(
        args!.shotId as string,
        args!.prompt as string,
        args!.imageBase64 as string,
        (args!.parentVersionId as string | null | undefined) ?? null
      );
    },
    create_remix_version(args?: Record<string, unknown>): ImageVersion {
      return createRemixVersion(
        args!.shotId as string,
        args!.parentVersionId as string,
        args!.editPrompt as string,
        args!.resultImageBase64 as string
      );
    },
    get_version_image_base64(args?: Record<string, unknown>): string | null {
      return getVersionImageBase64(args!.versionId as string);
    },
    delete_version(args?: Record<string, unknown>): boolean {
      return deleteVersion(args!.versionId as string);
    },
    get_version_count(args?: Record<string, unknown>): number {
      return getVersionCount(args!.shotId as string);
    },
  };
}
