import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openDatabase, loadMigrations } from "./db";
import { createProjectDocuments } from "./project-documents";
it("names a dangling legacy media file when conversion fails and leaves the legacy project intact", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "showbiz-copy-error-"));
  const media = path.join(root, "legacy-media");
  mkdirSync(media);
  const migrations = loadMigrations(path.resolve("electron/migrations"));
  const db = openDatabase(":memory:", migrations);
  db.exec(`INSERT INTO projects(id,name) VALUES ('p','Film'); INSERT INTO storyboards(id,project_id,name) VALUES ('sb','p','Opening'); INSERT INTO shots(id,storyboard_id,"order",image_path) VALUES ('shot','sb',1,'images/lost.png');`);
  const documents = createProjectDocuments({ migrations, recentPath: path.join(root, "recent.json"), legacy: { db, media }, bind: () => ({}) });
  try {
    expect(await documents.importLegacy("p", path.join(root, "Film.showbiz"))).toMatchObject({ ok: false, error: { message: expect.stringMatching(/copy.*images[/\\]lost\.png.*ENOENT/i) } });
    expect(db.prepare("SELECT image_path FROM shots WHERE id='shot'").get()).toEqual(expect.objectContaining({ image_path: "images/lost.png" }));
    expect(documents.current()).toBeNull();
  } finally { await documents.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
});
