import { db } from "../db";

export type EditType = "generation" | "regeneration" | "remix" | "inpaint";

export interface ImageVersion {
  id: string;
  shot_id: string;
  parent_version_id: string | null;
  version_number: number;
  edit_type: EditType;
  image_path: string;
  prompt: string | null;
  edit_prompt: string | null;
  mask_path: string | null;
  is_current: boolean;
  created_at: string;
}

export interface ImageVersionNode {
  version: ImageVersion;
  children: ImageVersionNode[];
}

export interface CreateVersionData {
  shotId: string;
  parentVersionId: string | null;
  editType: EditType;
  imagePath: string;
  prompt: string | null;
  editPrompt: string | null;
  maskPath: string | null;
}

function mapRow(row: Record<string, unknown>): ImageVersion {
  return {
    ...row,
    is_current: Boolean(row.is_current),
  } as ImageVersion;
}

export function getVersionsByShot(shotId: string): ImageVersion[] {
  const stmt = db.prepare(
    "SELECT * FROM image_versions WHERE shot_id = ? ORDER BY created_at ASC"
  );
  const rows = stmt.all(shotId) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function getVersionById(id: string): ImageVersion | null {
  const stmt = db.prepare("SELECT * FROM image_versions WHERE id = ?");
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function getCurrentVersion(shotId: string): ImageVersion | null {
  const stmt = db.prepare(
    "SELECT * FROM image_versions WHERE shot_id = ? AND is_current = 1"
  );
  const row = stmt.get(shotId) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function getNextVersionNumber(shotId: string): number {
  const stmt = db.prepare(
    "SELECT MAX(version_number) as max_ver FROM image_versions WHERE shot_id = ?"
  );
  const result = stmt.get(shotId) as { max_ver: number | null };
  return (result.max_ver || 0) + 1;
}

export function createVersion(data: CreateVersionData): ImageVersion {
  const id = `imgver-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const versionNumber = getNextVersionNumber(data.shotId);

  const transaction = db.transaction(() => {
    // Clear current flag from all versions of this shot
    db.prepare(
      "UPDATE image_versions SET is_current = 0 WHERE shot_id = ?"
    ).run(data.shotId);

    // Insert new version as current
    const stmt = db.prepare(`
      INSERT INTO image_versions
        (id, shot_id, parent_version_id, version_number, edit_type, image_path, prompt, edit_prompt, mask_path, is_current)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(
      id,
      data.shotId,
      data.parentVersionId,
      versionNumber,
      data.editType,
      data.imagePath,
      data.prompt,
      data.editPrompt,
      data.maskPath
    );
  });

  transaction();
  return getVersionById(id)!;
}

export function setCurrentVersion(shotId: string, versionId: string): void {
  const transaction = db.transaction(() => {
    // Clear current flag from all versions of this shot
    db.prepare(
      "UPDATE image_versions SET is_current = 0 WHERE shot_id = ?"
    ).run(shotId);

    // Set new current version
    db.prepare(
      "UPDATE image_versions SET is_current = 1 WHERE id = ? AND shot_id = ?"
    ).run(versionId, shotId);
  });

  transaction();
}

export function deleteVersion(versionId: string): boolean {
  const stmt = db.prepare("DELETE FROM image_versions WHERE id = ?");
  const result = stmt.run(versionId);
  return result.changes > 0;
}

export function getVersionCount(shotId: string): number {
  const stmt = db.prepare(
    "SELECT COUNT(*) as count FROM image_versions WHERE shot_id = ?"
  );
  const result = stmt.get(shotId) as { count: number };
  return result.count;
}

export function buildVersionTree(versions: ImageVersion[]): ImageVersionNode[] {
  const versionMap = new Map<string, ImageVersionNode>();
  const roots: ImageVersionNode[] = [];

  // Create nodes for all versions
  for (const version of versions) {
    versionMap.set(version.id, { version, children: [] });
  }

  // Build tree structure
  for (const version of versions) {
    const node = versionMap.get(version.id)!;
    if (version.parent_version_id) {
      const parent = versionMap.get(version.parent_version_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent was deleted, treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function getVersionTreeByShot(shotId: string): ImageVersionNode[] {
  const versions = getVersionsByShot(shotId);
  return buildVersionTree(versions);
}
