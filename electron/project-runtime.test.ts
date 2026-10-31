import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { loadMigrations } from "./db";
import { createProjectRuntime } from "./project-runtime";
import { createProjectCommands } from "./commands/projects";

it("keeps provider credentials application-wide while commands follow only the open document", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-document-runtime-"));
  const db = openTestDb();
  const runtime = createProjectRuntime({ appDirectory: directory, legacyDb: db, migrations: loadMigrations(path.resolve("electron/migrations")), exports: () => ({}), chooseOpen: async () => null, chooseSave: async (name) => path.join(directory, name), canSwitch: () => true, beginSave: () => () => {}, changed: () => {} });
  try {
    createProjectCommands(db, directory).create_project({ name: "Legacy film" });
    await runtime.invoke("save_api_key", { provider: "fal", apiKey: "secret" });
    expect(await runtime.invoke("get_projects")).toEqual([]);
    expect(await runtime.invoke("create_project_document")).toMatchObject({ ok: true, value: { name: "Untitled" } });
    expect(await runtime.invoke("get_api_key", { provider: "fal" })).toBe("secret");
    expect(await runtime.invoke("get_projects")).toMatchObject([{ name: "Untitled" }]);
    await runtime.invoke("close_project_document");
    expect(await runtime.invoke("get_api_key", { provider: "fal" })).toBe("secret");
    expect(await runtime.invoke("get_project_document_state")).toMatchObject({ ok: true, value: { current: null, legacy: [{ name: "Legacy film" }] } });
  } finally { await runtime.dispose(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
