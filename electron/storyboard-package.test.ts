import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { open, type Entry, type ZipFile } from "yauzl";
import { openDatabase, loadMigrations } from "./db";
import { exportStoryboardPackage } from "./storyboard-package";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

async function readArchive(file: string): Promise<Map<string, Buffer>> {
  const zip = await new Promise<ZipFile>((resolve, reject) => open(file, { lazyEntries: true }, (error, archive) => error || !archive ? reject(error) : resolve(archive)));
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>();
    zip.on("error", reject);
    zip.on("end", () => resolve(files));
    zip.on("entry", (entry: Entry) => zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) { reject(error); return; }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
    }));
    zip.readEntry();
  });
}

it("exports every shot in storyboard order with the selected media and a portable manifest", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "showbiz-package-"));
  roots.push(root);
  const db = openDatabase(":memory:", loadMigrations(path.resolve("electron/migrations")));
  db.exec(`INSERT INTO projects (id, name) VALUES ('p', 'Project');
    INSERT INTO storyboards (id, project_id, name) VALUES ('sb', 'p', 'Opening');
    INSERT INTO shots (id, storyboard_id, "order", image_path, video_path) VALUES
      ('shot-b', 'sb', 2, NULL, NULL), ('shot-a', 'sb', 1, 'images/frame.png', 'videos/take.mp4');`);
  mkdirSync(path.join(root, "images"));
  mkdirSync(path.join(root, "videos"));
  writeFileSync(path.join(root, "images/frame.png"), "selected image");
  writeFileSync(path.join(root, "videos/take.mp4"), "selected video");
  const destination = path.join(root, "Opening.sbz");
  const result = await exportStoryboardPackage(db, root, "sb", destination);
  expect(result).toEqual({ ok: true, value: { save_path: destination, shot_count: 2, media_count: 2 } });
  const archive = await readArchive(destination);
  const manifest: unknown = JSON.parse(archive.get("storyboard.json")!.toString());
  expect(manifest).toMatchObject({
    format: "showbiz-storyboard", version: 1, storyboard: { id: "sb", name: "Opening" },
    shots: [
      { id: "shot-a", order: 1, media: [{ role: "image", path: "shots/0001/image.png" }, { role: "video", path: "shots/0001/video.mp4" }] },
      { id: "shot-b", order: 2, media: [] },
    ],
  });
  expect(archive.get("shots/0001/video.mp4")!.toString()).toBe("selected video");
  expect(readFileSync(destination).subarray(0, 2).toString()).toBe("PK");
  db.close();
});

it("leaves an existing destination untouched when selected media is missing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "showbiz-missing-package-"));
  roots.push(root);
  const db = openDatabase(":memory:", loadMigrations(path.resolve("electron/migrations")));
  try {
    db.exec(`INSERT INTO projects (id, name) VALUES ('p', 'Project');
      INSERT INTO storyboards (id, project_id, name) VALUES ('sb', 'p', 'Opening');
      INSERT INTO shots (id, storyboard_id, "order", video_path) VALUES ('s', 'sb', 1, 'missing.mp4');`);
    const destination = path.join(root, "Opening.zip");
    writeFileSync(destination, "existing package");
    expect(await exportStoryboardPackage(db, root, "sb", destination)).toMatchObject({ ok: false, error: { code: "IO_ERROR", message: expect.stringMatching(/shot.*s.*video.*missing\.mp4.*ENOENT/i) } });
    expect(readFileSync(destination, "utf8")).toBe("existing package");
  } finally { db.close(); }
});
