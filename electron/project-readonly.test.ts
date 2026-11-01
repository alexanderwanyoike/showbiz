import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createProjectDocuments } from "./project-documents";
import { createProjectCommands } from "./commands/projects";
import { loadMigrations } from "./db";
it("opens a read-only project for inspection and makes an editable Save As copy", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-readonly-"));
  const source = path.join(directory, "source");
  fs.mkdirSync(source);
  const file = path.join(source, "Film.showbiz");
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: createProjectCommands,
  });
  try {
    const created = await documents.create(file);
    if (!created.ok) throw new Error(created.error.message);
    await documents.close();
    fs.chmodSync(file, 0o400);
    fs.chmodSync(source, 0o500);
    const before = fs.readFileSync(file);
    expect(await documents.open(file)).toMatchObject({
      ok: true,
      value: { read_only: true },
    });
    expect(await documents.invoke("get_projects")).toMatchObject([
      { name: "Film" },
    ]);
    await expect(
      documents.invoke("update_project", {
        id: created.value.project_id,
        name: "Changed",
      }),
    ).rejects.toThrow("Save As");
    expect(
      await documents.saveAs(path.join(directory, "Copy.showbiz")),
    ).toMatchObject({ ok: true, value: { read_only: false } });
    await documents.invoke("update_project", {
      id: created.value.project_id,
      name: "Changed",
    });
    expect(await documents.invoke("get_projects")).toMatchObject([
      { name: "Changed" },
    ]);
    expect(fs.readFileSync(file)).toEqual(before);
  } finally {
    await documents.close();
    fs.chmodSync(source, 0o700);
    fs.chmodSync(file, 0o600);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it("rejects an unclassified document command before it can mutate the project", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-command-classification-"));
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: (db, media) => ({...createProjectCommands(db, media), forgotten_mutation: () => db.prepare("UPDATE projects SET name = 'Changed'").run()}),
  });
  try {
    const created = await documents.create(path.join(directory, "Film.showbiz"));
    expect(created.ok).toBe(true);
    await expect(documents.invoke("forgotten_mutation")).rejects.toThrow("Unclassified project command");
    expect(await documents.invoke("get_projects")).toMatchObject([{name:"Film"}]);
  } finally {
    await documents.close();
    fs.rmSync(directory, {recursive:true,force:true});
  }
});
