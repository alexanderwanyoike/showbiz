import { createWriteStream } from "node:fs";
import { realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { DatabaseSync } from "node:sqlite";
import { ZipFile } from "yazl";
import type { Result } from "../shared/result";
import type { StoryboardPackage, StoryboardPackageExport } from "../shared/storyboard-package";

interface PackageShot {
  id: string;
  order: number;
  duration: number;
  image_path: string | null;
  end_frame_path: string | null;
  video_path: string | null;
}

export async function exportStoryboardPackage(
  db: DatabaseSync,
  mediaDir: string,
  storyboardId: string,
  destination: string,
): Promise<Result<StoryboardPackageExport>> {
  if (!path.isAbsolute(destination) || ![".zip", ".sbz"].includes(path.extname(destination).toLowerCase())) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Choose an absolute .zip or .sbz destination" } };
  }
  const storyboard = db.prepare("SELECT id, name FROM storyboards WHERE id = ?").get(storyboardId) as { id: string; name: string } | undefined;
  if (!storyboard) return { ok: false, error: { code: "NOT_FOUND", message: "Storyboard not found" } };
  const rows = db.prepare('SELECT id, "order", duration, image_path, end_frame_path, video_path FROM shots WHERE storyboard_id = ? ORDER BY "order", id').all(storyboardId) as unknown as PackageShot[];
  const manifest: StoryboardPackage = { format: "showbiz-storyboard", version: 1, storyboard, shots: [] };
  const files: { source: string; entry: string }[] = [];
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const root = await realpath(mediaDir);
    for (const [index, shot] of rows.entries()) {
      const media: StoryboardPackage["shots"][number]["media"] = [];
      for (const role of ["image", "end_frame", "video"] as const) {
        const relative = shot[`${role}_path`];
        if (!relative) continue;
        const source = await realpath(path.resolve(root, relative));
        if (!source.startsWith(`${root}${path.sep}`) || !(await stat(source)).isFile()) {
          return { ok: false, error: { code: "INVALID_INPUT", message: "Shot media must be files inside the media directory" } };
        }
        const extension = path.extname(source).toLowerCase();
        if (!/^\.(png|jpe?g|webp|gif|mp4|mov|mkv|webm)$/.test(extension)) {
          return { ok: false, error: { code: "INVALID_INPUT", message: "Unsupported shot media type" } };
        }
        const entry = `shots/${String(index + 1).padStart(4, "0")}/${role}${extension}`;
        media.push({ role, path: entry });
        files.push({ source, entry });
      }
      manifest.shots.push({ id: shot.id, order: shot.order, duration: shot.duration, media });
    }
    if (files.length === 0) return { ok: false, error: { code: "INVALID_INPUT", message: "This storyboard has no media to export" } };
    if (files.some((file) => file.source === path.resolve(destination))) {
      return { ok: false, error: { code: "INVALID_INPUT", message: "The package cannot overwrite source media" } };
    }
    const zip = new ZipFile();
    zip.on("error", (error: Error) => zip.outputStream.destroy(error));
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "storyboard.json");
    for (const file of files) zip.addFile(file.source, file.entry, { compress: false });
    const completion = pipeline(zip.outputStream, createWriteStream(temporary, { flags: "wx" }));
    zip.end();
    await completion;
    await rename(temporary, destination);
    return { ok: true, value: { save_path: destination, shot_count: rows.length, media_count: files.length } };
  } catch (cause) {
    await rm(temporary, { force: true });
    return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : String(cause) } };
  }
}
