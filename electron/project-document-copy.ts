import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db";
import { initMediaDirs } from "./media-files";
import { resolveMediaPath } from "./media";

export const DOCUMENT_APPLICATION_ID = 0x53425a44;
const MEDIA_COLUMNS = [
  ["shots", "image_path"], ["shots", "end_frame_path"], ["shots", "video_path"],
  ["image_versions", "image_path"], ["image_versions", "mask_path"],
  ["video_versions", "video_path"], ["bible_asset_variants", "media_path"],
] as const;
export function documentMediaPaths(db: DatabaseSync): string[] {
  return [...new Set(MEDIA_COLUMNS.flatMap(([table, column]) => db.prepare(`SELECT ${column} AS file FROM ${table} WHERE ${column} IS NOT NULL`).all().map((row) => {
    if (typeof row.file !== "string") throw new Error("Invalid project media path.");
    return row.file;
  })))];
}
export async function copyProjectDocument(options: {
  source: DatabaseSync; sourceMedia: string; file: string; media: string; migrations: string[]; projectId?: string;
}): Promise<DatabaseSync> {
  options.source.prepare("VACUUM INTO ?").run(options.file);
  const db = openDatabase(options.file, options.migrations);
  try {
    if (options.projectId) db.prepare("DELETE FROM projects WHERE id <> ?").run(options.projectId);
    db.exec(`DELETE FROM settings; PRAGMA application_id = ${DOCUMENT_APPLICATION_ID}`);
    initMediaDirs(options.media);
    const paths = documentMediaPaths(db);
    const base = paths.length ? await fs.realpath(options.sourceMedia) : options.sourceMedia;
    for (const relative of paths) {
      const source = await fs.realpath(resolveMediaPath(options.sourceMedia, relative));
      if (!source.startsWith(`${base}${path.sep}`)) throw new Error("Project media points outside its media folder.");
      const target = resolveMediaPath(options.media, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
    }
    return db;
  } catch (cause) { db.close(); throw cause; }
}
