import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { createSettingsCommands } from "./commands/settings";
import { loadMigrations } from "./db";
import { createProjectCommands } from "./commands/projects";
import { createShotCommands } from "./commands/shots";
import { createProjectDocuments } from "./project-documents";
import { createImageVersionCommands } from "./commands/image-versions";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    ),
);
function setup(legacy?: {
  db: import("node:sqlite").DatabaseSync;
  media: string;
}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-document-"));
  directories.push(directory);
  const documents = createProjectDocuments({
    legacy,
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: (db, media) => ({
      ...createProjectCommands(db, media),
      ...createShotCommands(db, media),
      ...createSettingsCommands(db),
      ...createImageVersionCommands(db, media),
    }),
  });
  return { directory, documents };
}
async function createFixtureShot(
  documents: ReturnType<typeof createProjectDocuments>,
  projectId: string,
) {
  const board = (await documents.invoke("create_storyboard", {
    projectId,
    name: "Opening",
  })) as { id: string };
  return (await documents.invoke("create_shot", {
    storyboardId: board.id,
  })) as { id: string };
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
    const board = await documents.invoke("create_storyboard", {
      projectId: created.value.project_id,
      name: "Opening",
    });
    expect(board).toMatchObject({ name: "Opening" });
    expect((await documents.close()).ok).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
    expect((await documents.open(file)).ok).toBe(true);
    expect(
      await documents.invoke("get_storyboards", {
        projectId: created.value.project_id,
      }),
    ).toMatchObject([{ name: "Opening" }]);
    expect(documents.recent()).toMatchObject([
      { file_path: file, name: "Morning" },
    ]);
  } finally {
    await documents.close();
  }
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
    expect(await documents.invoke("get_projects")).toMatchObject([
      { name: "Morning" },
    ]);
    expect(fs.readFileSync(other, "utf8")).toBe("not a project");
    await expect(
      documents.invoke("create_project", { name: "Second" }),
    ).rejects.toThrow("File");
  } finally {
    await documents.close();
  }
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
    expect(await documents.invoke("get_projects")).toMatchObject([
      { name: "First" },
    ]);
    expect(fs.existsSync(second)).toBe(false);
  } finally {
    await documents.close();
  }
});

it("saves a separate working copy with its media and keeps the original unchanged", async () => {
  const { directory, documents } = setup();
  const source = path.join(directory, "Original.showbiz");
  const copy = path.join(directory, "Copy.showbiz");
  try {
    const created = await documents.create(source);
    if (!created.ok) throw new Error(created.error.message);
    const shot = await createFixtureShot(documents, created.value.project_id);
    await documents.invoke("save_shot_image", {
      id: shot.id,
      base64DataUrl: "data:image/png;base64,Zml4dHVyZQ==",
      prompt: "Frame",
    });
    expect((await documents.saveAs(copy)).ok).toBe(true);
    expect(documents.current()?.file_path).toBe(copy);
    expect(
      fs.readFileSync(
        path.join(documents.mediaDirectory()!, "images", `${shot.id}.png`),
        "utf8",
      ),
    ).toBe("fixture");
    await documents.invoke("update_project", {
      id: created.value.project_id,
      name: "Changed copy",
    });
    await documents.open(source);
    expect(documents.current()?.name).toBe("Original");
    await documents.open(copy);
    expect(documents.current()?.name).toBe("Changed copy");
  } finally {
    await documents.close();
  }
});

it("refuses concurrent editing of the same document and permits reopening after close", async () => {
  const first = setup();
  const second = setup();
  const file = path.join(first.directory, "One.showbiz");
  try {
    await first.documents.create(file);
    expect((await second.documents.open(file)).ok).toBe(false);
    expect(second.documents.current()).toBeNull();
    await first.documents.close();
    expect((await second.documents.open(file)).ok).toBe(true);
  } finally {
    await first.documents.close();
    await second.documents.close();
  }
});

it("converts one legacy library project with its media without copying credentials or removing the original", async () => {
  const legacy = openTestDb();
  const fixture = setup();
  const media = path.join(fixture.directory, "legacy-media");
  fs.mkdirSync(path.join(media, "images"), { recursive: true });
  fs.writeFileSync(path.join(media, "images", "frame.png"), "frame");
  const old = createProjectCommands(legacy, media);
  const project = old.create_project({ name: "Existing film" });
  old.create_project({ name: "Another film" });
  const board = old.create_storyboard({
    projectId: project.id,
    name: "Opening",
  });
  legacy
    .prepare(
      'INSERT INTO shots(id,storyboard_id,"order",image_path) VALUES (?,?,1,?)',
    )
    .run("shot", board.id, "images/frame.png");
  createSettingsCommands(legacy).save_api_key({
    provider: "fal",
    apiKey: "private-secret",
  });
  const { directory, documents } = setup({ db: legacy, media });
  try {
    expect(documents.legacy()).toHaveLength(2);
    expect(
      (
        await documents.importLegacy(
          project.id,
          path.join(directory, "Converted.showbiz"),
        )
      ).ok,
    ).toBe(true);
    expect(await documents.invoke("get_projects")).toMatchObject([
      { name: "Existing film" },
    ]);
    expect(
      await documents.invoke("get_api_key", { provider: "fal" }),
    ).toBeNull();
    expect(
      fs.readFileSync(
        path.join(documents.mediaDirectory()!, "images", "frame.png"),
        "utf8",
      ),
    ).toBe("frame");
    expect(
      fs
        .readFileSync(path.join(directory, "Converted.showbiz"))
        .includes(Buffer.from("private-secret")),
    ).toBe(false);
    expect(old.get_projects()).toHaveLength(2);
    expect(
      createSettingsCommands(legacy).get_api_key({ provider: "fal" }),
    ).toBe("private-secret");
  } finally {
    await documents.close();
    legacy.close();
  }
});

it("rejects project media that escapes its companion folder and retains the active file", async () => {
  const { directory, documents } = setup();
  const unsafe = path.join(directory, "Unsafe.showbiz");
  const safe = path.join(directory, "Safe.showbiz");
  const result = await documents.create(unsafe);
  if (!result.ok) throw new Error(result.error.message);
  const projectId = result.value.project_id;
  const board = (await documents.invoke("create_storyboard", {
    projectId,
    name: "Opening",
  })) as { id: string };
  await documents.close();
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(unsafe);
  db.prepare(
    'INSERT INTO shots(id,storyboard_id,"order",image_path) VALUES (?,?,1,?)',
  ).run("shot", board.id, "../../private.png");
  db.close();
  try {
    await documents.create(safe);
    expect((await documents.open(unsafe)).ok).toBe(false);
    expect(documents.current()?.file_path).toBe(safe);
  } finally {
    await documents.close();
  }
});

it("still opens project files when the recent-file list is corrupt", async () => {
  const { directory, documents } = setup();
  const file = path.join(directory, "Film.showbiz");
  await documents.create(file);
  await documents.close();
  fs.writeFileSync(path.join(directory, "recent.json"), "invalid json");
  let reopened: ReturnType<typeof createProjectDocuments> | undefined;
  try {
    reopened = createProjectDocuments({
      migrations: loadMigrations(path.resolve("electron/migrations")),
      recentPath: path.join(directory, "recent.json"),
      bind: (db, media) => createProjectCommands(db, media),
    });
    expect(reopened.warning()).toContain("recent");
    expect((await reopened.open(file)).ok).toBe(true);
    expect(reopened.warning()).toBeNull();
  } finally {
    await reopened?.close();
  }
});

it("moves all shot media with the project file alone and recreates disposable media caches on another machine", async () => {
  const first = setup();
  const second = setup();
  const file = path.join(first.directory, "Portable.showbiz");
  const moved = path.join(second.directory, "Moved.showbiz");
  try {
    const created = await first.documents.create(file);
    if (!created.ok) throw new Error(created.error.message);
    const board = (await first.documents.invoke("create_storyboard", {
      projectId: created.value.project_id,
      name: "Opening",
    })) as { id: string };
    const shot = (await first.documents.invoke("create_shot", {
      storyboardId: board.id,
    })) as { id: string };
    await first.documents.invoke("save_shot_image", {
      id: shot.id,
      base64DataUrl: "data:image/png;base64,ZnJhbWU=",
      prompt: "Morning",
    });
    await first.documents.invoke("save_shot_video", {
      id: shot.id,
      base64DataUrl: "data:video/mp4;base64,dmlkZW8=",
    });
    await first.documents.close();
    fs.copyFileSync(file, moved);
    fs.rmSync(first.directory, { recursive: true, force: true });
    const opened = await second.documents.open(moved);
    expect(opened).toMatchObject({ ok: true });
    expect(
      await second.documents.invoke("get_shot_image_base64", {
        shotId: shot.id,
      }),
    ).toBe("data:image/png;base64,ZnJhbWU=");
    expect(
      fs.readFileSync(
        path.join(
          second.documents.mediaDirectory()!,
          "videos",
          `${shot.id}.mp4`,
        ),
        "utf8",
      ),
    ).toBe("video");
    expect(fs.existsSync(`${moved}.media`)).toBe(false);
  } finally {
    await first.documents.close();
    await second.documents.close();
  }
});

it("keeps shot reordering atomic inside a self-contained document save", async () => {
  const { directory, documents } = setup();
  try {
    const created = await documents.create(
      path.join(directory, "Order.showbiz"),
    );
    if (!created.ok) throw new Error(created.error.message);
    const board = (await documents.invoke("create_storyboard", {
      projectId: created.value.project_id,
      name: "Opening",
    })) as { id: string };
    const first = (await documents.invoke("create_shot", {
      storyboardId: board.id,
    })) as { id: string };
    const second = (await documents.invoke("create_shot", {
      storyboardId: board.id,
    })) as { id: string };
    await documents.invoke("reorder_shots", {
      storyboardId: board.id,
      shotIds: [second.id, first.id],
    });
    expect(
      (
        (await documents.invoke("get_shots", { storyboardId: board.id })) as {
          id: string;
        }[]
      ).map((shot) => shot.id),
    ).toEqual([second.id, first.id]);
  } finally {
    await documents.close();
  }
});

it("rolls back project edits and recovers the saved media if packaging fails", async () => {
  const { directory, documents } = setup();
  try {
    const created = await documents.create(
      path.join(directory, "Saved.showbiz"),
    );
    if (!created.ok) throw new Error(created.error.message);
    const board = (await documents.invoke("create_storyboard", {
      projectId: created.value.project_id,
      name: "Opening",
    })) as { id: string };
    const shot = (await documents.invoke("create_shot", {
      storyboardId: board.id,
    })) as { id: string };
    await documents.invoke("save_shot_image", {
      id: shot.id,
      base64DataUrl: "data:image/png;base64,ZnJhbWU=",
      prompt: "Saved",
    });
    fs.rmSync(
      path.join(documents.mediaDirectory()!, "images", `${shot.id}.png`),
    );
    await expect(
      documents.invoke("update_project", {
        id: created.value.project_id,
        name: "Unsaved",
      }),
    ).rejects.toThrow("included");
    expect(documents.current()?.name).toBe("Saved");
    expect(
      await documents.invoke("get_shot_image_base64", { shotId: shot.id }),
    ).toBe("data:image/png;base64,ZnJhbWU=");
  } finally {
    await documents.close();
  }
});

it("reopens embedded media larger than one chunk without an external media folder", async () => {
  const first = setup();
  const second = setup();
  try {
    const file = path.join(first.directory, "Large.showbiz");
    const copy = path.join(second.directory, "Large.showbiz");
    const created = await first.documents.create(file);
    if (!created.ok) throw new Error(created.error.message);
    const shot = await createFixtureShot(first.documents, created.value.project_id);
    const bytes = Buffer.alloc(9 * 1024 * 1024, 37);
    bytes[bytes.length - 1] = 91;
    await first.documents.invoke("save_shot_video", {
      id: shot.id,
      base64DataUrl: `data:video/mp4;base64,${bytes.toString("base64")}`,
    });
    expect((await first.documents.save()).ok).toBe(true);
    await first.documents.close();
    fs.copyFileSync(file, copy);
    fs.rmSync(first.directory, { recursive: true, force: true });
    expect((await second.documents.open(copy)).ok).toBe(true);
    expect(
      fs
        .readFileSync(
          path.join(second.documents.mediaDirectory()!, "videos", `${shot.id}.mp4`),
        )
        .equals(bytes),
    ).toBe(true);
  } finally {
    await first.documents.close();
    await second.documents.close();
  }
});

it("excludes deleted take bytes and unrelated cache files from a saved project copy", async () => {
  const { directory, documents } = setup();
  const source = path.join(directory, "Original.showbiz");
  const copy = path.join(directory, "Shared.showbiz");
  const removedBytes = Buffer.from("private-deleted-take-4d45fc27");
  try {
    const created = await documents.create(source);
    if (!created.ok) throw new Error(created.error.message);
    const shot = await createFixtureShot(documents, created.value.project_id);
    const removed = (await documents.invoke("create_generation_version", {
      shotId: shot.id,
      prompt: "First take",
      imageBase64: `data:image/png;base64,${removedBytes.toString("base64")}`,
    })) as { id: string; image_path: string };
    await documents.invoke("create_generation_version", {
      shotId: shot.id,
      prompt: "Current take",
      imageBase64: `data:image/png;base64,${Buffer.from("retained-take").toString("base64")}`,
    });
    await documents.invoke("delete_version", { versionId: removed.id });
    fs.writeFileSync(path.join(documents.mediaDirectory()!, "images", "unrelated.png"), removedBytes);
    expect((await documents.saveAs(copy)).ok).toBe(true);
    expect(fs.readFileSync(copy).includes(removedBytes)).toBe(false);
    expect(fs.existsSync(path.join(documents.mediaDirectory()!, removed.image_path))).toBe(false);
    expect(await documents.invoke("get_shot_image_base64", { shotId: shot.id })).toBe(
      `data:image/png;base64,${Buffer.from("retained-take").toString("base64")}`,
    );
  } finally {
    await documents.close();
  }
});
