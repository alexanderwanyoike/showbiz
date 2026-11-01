import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadMigrations, openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
import { createProjectDocuments } from "./project-documents";
import { initMediaDirs } from "./media-files";

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
  const project = createProjectCommands(legacyDb, media).create_project({ name: "Legacy film" });
  const documents = createProjectDocuments({
    legacy: { db: legacyDb, media }, migrations,
    recentPath: path.join(directory, "recent.json"),
    bind: (db, files) => createProjectCommands(db, files),
  });
  cleanups.push(async () => {
    await documents.close();
    legacyDb.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const original = path.join(directory, "Source.showbiz");
  expect((await documents.create(original)).ok).toBe(true);
  return { directory, documents, project, original };
}

it.each(["create", "saveAs", "importLegacy"] as const)(
  "%s safely replaces a closed existing project after the save dialog chooses it",
  async (operation) => {
    const source = await fixture();
    const previous = await fixture();
    await previous.documents.close();
    const result = operation === "importLegacy"
      ? await source.documents.importLegacy(source.project.id, previous.original)
      : await source.documents[operation](previous.original);
    expect(result).toMatchObject({ ok: true });
    expect(source.documents.current()?.file_path).toBe(previous.original);
    expect(source.documents.current()?.name).toBe(operation === "importLegacy" ? "Legacy film" : "Source");
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
  expect(await source.documents.invoke("get_projects")).toMatchObject([{name:"Source"}]);
});
