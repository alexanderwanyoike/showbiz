import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase, loadMigrations } from "./db";
import { exportStoryboardPackage } from "./storyboard-package";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

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
  const manifest: unknown = JSON.parse(execFileSync("unzip", ["-p", destination, "storyboard.json"], { encoding: "utf8" }));
  expect(manifest).toMatchObject({
    format: "showbiz-storyboard", version: 1, storyboard: { id: "sb", name: "Opening" },
    shots: [
      { id: "shot-a", order: 1, media: [{ role: "image", path: "shots/0001/image.png" }, { role: "video", path: "shots/0001/video.mp4" }] },
      { id: "shot-b", order: 2, media: [] },
    ],
  });
  expect(execFileSync("unzip", ["-p", destination, "shots/0001/video.mp4"], { encoding: "utf8" })).toBe("selected video");
  expect(readFileSync(destination).subarray(0, 2).toString()).toBe("PK");
  db.close();
});
