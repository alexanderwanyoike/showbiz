import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProjectDocuments } from "../project-documents";
import { loadMigrations } from "../db";
import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createTestDataCommands as createDataCommands } from "../test-support/data-commands";
import { createInvokeHandler } from "../ipc";
it("removes only the selected start frame while preserving image takes and saved video", async () => {
  const db = openTestDb();
  try {
    const commands = createDataCommands(db, "/unused");
    const project = commands.create_project({ name: "Film" });
    const board = commands.create_storyboard({
      projectId: project.id,
      name: "Opening",
    });
    const shot = commands.create_shot({ storyboardId: board.id });
    db.prepare(
      "UPDATE shots SET image_path='frame.png',video_path='video.mp4' WHERE id=?",
    ).run(shot.id);
    db.prepare(
      "INSERT INTO image_versions(id,shot_id,version_number,edit_type,image_path,is_current) VALUES ('take',?,1,'generation','frame.png',1)",
    ).run(shot.id);
    expect(
      await createInvokeHandler(commands)("clear_shot_start_frame", {
        shot_id: shot.id,
      }),
    ).toMatchObject({ ok: true });
    expect(commands.get_shots({ storyboardId: board.id })[0]).toMatchObject({
      image_path: null,
      image_url: null,
      video_path: "video.mp4",
    });
    const versions = commands.get_image_versions({ shotId: shot.id });
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toMatchObject({
      id: "take",
      image_path: "frame.png",
      is_current: false,
    });
  } finally {
    db.close();
  }
});
it("removes a selected frame through a self-contained document and restores its take after reopening", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-frame-document-"),
  );
  const file = path.join(directory, "Film.showbiz");
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: createDataCommands,
  });
  try {
    const created = await documents.create(file);
    if (!created.ok) throw new Error(created.error.message);
    const board = (await documents.invoke("create_storyboard", {
      projectId: created.value.project_id,
      name: "Opening",
    })) as { id: string };
    const shot = (await documents.invoke("create_shot", {
      storyboardId: board.id,
    })) as { id: string };
    const imageBase64 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const take = (await documents.invoke("create_generation_version", {
      shotId: shot.id,
      prompt: "Uploaded frame",
      imageBase64,
      parentVersionId: null,
    })) as { id: string };
    expect(
      await documents.invoke("clear_shot_start_frame", { shot_id: shot.id }),
    ).toEqual({ ok: true, value: null });
    expect(
      await documents.invoke("get_shots", { storyboardId: board.id }),
    ).toMatchObject([{ image_path: null, image_url: null }]);
    expect((await documents.close()).ok).toBe(true);
    expect((await documents.open(file)).ok).toBe(true);
    expect(
      await documents.invoke("get_image_versions", { shotId: shot.id }),
    ).toMatchObject([{ version: { id: take.id, is_current: false } }]);
    await documents.invoke("switch_to_version", {
      shotId: shot.id,
      versionId: take.id,
    });
    expect(
      await documents.invoke("get_shot_image_base64", { shotId: shot.id }),
    ).toBe(imageBase64);
  } finally {
    await documents.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
