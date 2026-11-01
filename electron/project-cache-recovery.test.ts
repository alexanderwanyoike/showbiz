import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createProjectDocuments } from "./project-documents";
import { createProjectCommands } from "./commands/projects";
import { loadMigrations } from "./db";
import { createProjectCache } from "./project-cache";
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
      JSON.parse(
        fs.readFileSync(
          path.join(path.dirname(workspace), ".owner.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ pid: process.pid });
    await documents.close();
    expect(fs.existsSync(workspace)).toBe(false);
  } finally {
    await documents.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it("keeps cache ownership outside media replaced during extraction", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-cache-extraction-"),
  );
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: createProjectCommands,
  });
  const file = path.join(directory, "Film.showbiz");
  try {
    await documents.create(file);
    await documents.close();
    expect(await documents.open(file)).toMatchObject({ ok: true });
    const media = documents.mediaDirectory()!;
    const workspace = path.dirname(media);
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

it("continues recovering later abandoned caches after a corrupt owner marker", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-cache-corrupt-"));
  const corrupt = path.join(directory, "open-a-corrupt");
  const stale = path.join(directory, "open-z-stale");
  fs.mkdirSync(corrupt);
  fs.writeFileSync(path.join(corrupt, ".owner.json"), "");
  fs.mkdirSync(stale);
  fs.writeFileSync(path.join(stale, ".owner.json"), JSON.stringify({...createProcessOwner(), identity: "previous-incarnation"}));
  try {
    const recovered = createProjectCache(directory).sweep();
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(corrupt)).toBe(true);
    expect(recovered).toMatchObject({ok: false, error: {message: expect.stringContaining(corrupt)}});
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
