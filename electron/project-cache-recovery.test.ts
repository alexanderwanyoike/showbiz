import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createProjectDocuments } from "./project-documents";
import { createProjectCommands } from "./commands/projects";
import { loadMigrations } from "./db";
import { createProcessOwner } from "./process-owner";
it("sweeps abandoned media workspaces but retains live and unverified owners", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-cache-recovery-"),
  );
  const cache = path.join(directory, "project-cache");
  fs.mkdirSync(cache);
  const stale = path.join(cache, "open-stale");
  const live = path.join(cache, "open-live");
  const legacy = path.join(cache, "open-legacy");
  for (const folder of [stale, live, legacy]) {
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "frame.png"), "media");
  }
  fs.writeFileSync(
    path.join(stale, ".owner.json"),
    JSON.stringify({
      ...createProcessOwner(),
      identity: "previous-incarnation",
    }),
  );
  fs.writeFileSync(
    path.join(live, ".owner.json"),
    JSON.stringify(createProcessOwner()),
  );
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: createProjectCommands,
  });
  try {
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(legacy)).toBe(true);
    expect(
      await documents.create(path.join(directory, "Film.showbiz")),
    ).toMatchObject({ ok: true });
    const workspace = documents.mediaDirectory()!;
    expect(
      JSON.parse(fs.readFileSync(path.join(workspace, ".owner.json"), "utf8")),
    ).toMatchObject({ pid: process.pid });
    await documents.close();
    expect(fs.existsSync(workspace)).toBe(false);
  } finally {
    await documents.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
