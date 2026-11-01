import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadMigrations, openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
import { createProjectDocuments } from "./project-documents";
import { initMediaDirs } from "./media-files";

import { DatabaseSync } from "node:sqlite";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-replace-"));
  const migrations = loadMigrations(path.resolve("electron/migrations"));
  const legacyDb = openDatabase(":memory:", migrations);
  const media = path.join(directory, "legacy-media");
  initMediaDirs(media);
  const project = createProjectCommands(legacyDb, media).create_project({
    name: "Legacy film",
  });
  const documents = createProjectDocuments({
    legacy: { db: legacyDb, media },
    migrations,
    recentPath: path.join(directory, "recent.json"),
    bind: (db, files) => createProjectCommands(db, files),
  });
  cleanups.push(async () => {
    await documents.close();
    legacyDb.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const original = path.join(directory, "Source.showbiz");
  const created = await documents.create(original);
  if (!created.ok) throw new Error(created.error.message);
  return {
    directory,
    documents,
    project,
    legacyDb,
    media,
    original,
    originalProjectId: created.value.project_id,
  };
}

it.each(["create", "saveAs", "importLegacy"] as const)(
  "%s safely replaces a closed existing project after the save dialog chooses it",
  async (operation) => {
    const source = await fixture();
    const previous = await fixture();
    await previous.documents.close();
    const result =
      operation === "importLegacy"
        ? await source.documents.importLegacy(
            source.project.id,
            previous.original,
          )
        : await source.documents[operation](previous.original);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.project_id).not.toBe(previous.originalProjectId);
    if (operation !== "create")
      expect(result.value.project_id).toBe(
        operation === "importLegacy"
          ? source.project.id
          : source.originalProjectId,
      );
    expect(source.documents.current()?.file_path).toBe(previous.original);
    expect(source.documents.current()?.name).toBe(
      operation === "importLegacy" ? "Legacy film" : "Source",
    );
    expect((await source.documents.close()).ok).toBe(true);
    expect((await previous.documents.open(previous.original)).ok).toBe(true);
  },
);

it("keeps the previous target bytes and current project if activation cannot save recents", async () => {
  const source = await fixture();
  const previous = await fixture();
  await previous.documents.close();
  const before = fs.readFileSync(previous.original);
  fs.unlinkSync(path.join(source.directory, "recent.json"));
  fs.mkdirSync(path.join(source.directory, "recent.json"));
  const result = await source.documents.saveAs(previous.original);
  expect(result).toMatchObject({ ok: false });
  expect(fs.readFileSync(previous.original)).toEqual(before);
  expect(source.documents.current()?.file_path).toBe(source.original);
  expect(await source.documents.invoke("get_projects")).toMatchObject([
    { name: "Source" },
  ]);
});


it("does not rewrite unchanged embedded media on the first edit after conversion or Save As", async () => {
  const source = await fixture();
  const board = createProjectCommands(source.legacyDb, source.media).create_storyboard({
    projectId: source.project.id,
    name: "Opening",
  });
  source.legacyDb.prepare('INSERT INTO shots(id,storyboard_id,"order",image_path) VALUES (?,?,1,?)')
    .run("shot", board.id, "images/frame.png");
  fs.writeFileSync(path.join(source.media, "images/frame.png"), "frame");
  source.legacyDb.exec(`CREATE TABLE media_writes (count INTEGER NOT NULL);
    INSERT INTO media_writes VALUES (0);`);
  const converted = path.join(source.directory, "Converted.showbiz");
  expect(await source.documents.importLegacy(source.project.id, converted)).toMatchObject({ok: true});
  const convertedDb = new DatabaseSync(converted);
  convertedDb.exec(`CREATE TRIGGER audit_media_writes AFTER INSERT ON document_file_chunks
    BEGIN UPDATE media_writes SET count = count + 1; END;`);
  try {
    await source.documents.invoke("update_project", {id: source.project.id, name: "Converted edit"});
    expect(convertedDb.prepare("SELECT count FROM media_writes").get()?.count).toBe(0);
  } finally { convertedDb.close(); }
  const copy = path.join(source.directory, "Copy.showbiz");
  expect(await source.documents.saveAs(copy)).toMatchObject({ok: true});
  const copyDb = new DatabaseSync(copy);
  try {
    const before = copyDb.prepare("SELECT count FROM media_writes").get()?.count;
    await source.documents.invoke("update_project", {id: source.project.id, name: "Copy edit"});
    expect(copyDb.prepare("SELECT count FROM media_writes").get()?.count).toBe(before);
  } finally { copyDb.close(); }
});
