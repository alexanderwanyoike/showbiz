import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadMigrations } from "./db";
import { createProjectCommands } from "./commands/projects";
import { createShotCommands } from "./commands/shots";
import { createProjectDocuments } from "./project-documents";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));
function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-document-"));
  directories.push(directory);
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: (db, media) => ({ ...createProjectCommands(db, media), ...createShotCommands(db, media) }),
  });
  return { directory, documents };
}
it("creates a project file and reopens its saved storyboard independently of the app library", async () => {
  const { directory, documents } = setup();
  const file = path.join(directory, "Morning.showbiz");
  try {
    expect(documents.current()).toBeNull();
    const created = await documents.create(file);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.file_path).toBe(file);
    const board = await documents.invoke("create_storyboard", { projectId: created.value.project_id, name: "Opening" });
    expect(board).toMatchObject({ name: "Opening" });
    expect((await documents.close()).ok).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
    expect((await documents.open(file)).ok).toBe(true);
    expect(await documents.invoke("get_storyboards", { projectId: created.value.project_id })).toMatchObject([{ name: "Opening" }]);
    expect(documents.recent()).toMatchObject([{ file_path: file, name: "Morning" }]);
  } finally { await documents.close(); }
});

it("keeps the open project usable after an invalid open or refused overwrite", async () => {
  const { directory, documents } = setup();
  const file = path.join(directory, "Morning.showbiz");
  const other = path.join(directory, "foreign.showbiz");
  fs.writeFileSync(other, "not a project");
  try {
    await documents.create(file);
    const before = documents.current();
    expect((await documents.open(other)).ok).toBe(false);
    expect((await documents.create(file)).ok).toBe(false);
    expect(documents.current()).toEqual(before);
    expect(await documents.invoke("get_projects")).toMatchObject([{ name: "Morning" }]);
    expect(fs.readFileSync(other, "utf8")).toBe("not a project");
    await expect(documents.invoke("create_project", { name: "Second" })).rejects.toThrow("File");
  } finally { await documents.close(); }
});

it("removes an incomplete new document without changing the current one when recent-file persistence fails", async () => {
  const { directory, documents } = setup();
  const first = path.join(directory, "First.showbiz");
  const second = path.join(directory, "Second.showbiz");
  try {
    await documents.create(first);
    fs.unlinkSync(path.join(directory, "recent.json"));
    fs.mkdirSync(path.join(directory, "recent.json"));
    expect((await documents.create(second)).ok).toBe(false);
    expect(documents.current()?.file_path).toBe(first);
    expect(await documents.invoke("get_projects")).toMatchObject([{ name: "First" }]);
    expect(fs.existsSync(second)).toBe(false);
  } finally { await documents.close(); }
});
