import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { loadMigrations } from "./db";
import { createProjectRuntime } from "./project-runtime";

it("saves generation usage inside the portable project instead of device settings", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-usage-runtime-"),
  );
  const db = openTestDb();
  let file: string | null = null;
  const runtime = createProjectRuntime({
    appDirectory: directory,
    legacyDb: db,
    migrations: loadMigrations(path.resolve("electron/migrations")),
    exports: () => ({}),
    chooseOpen: async () => file,
    chooseSave: async (name) => path.join(directory, name),
    canSwitch: () => true,
    beginSave: () => () => {},
    changed: () => {},
  });
  try {
    const created = (await runtime.invoke("create_project_document")) as {
      ok: true;
      value: { project_id: string; file_path: string };
    };
    file = created.value.file_path;
    expect(
      await runtime.invoke("begin_generation_usage", {
        request_id: "portable",
        project_id: created.value.project_id,
        kind: "image",
        provider: "fal",
        model_id: "image",
      }),
    ).toMatchObject({ ok: true });
    await runtime.invoke("finish_generation_usage", {
      request_id: "portable",
      status: "completed",
    });
    await runtime.invoke("close_project_document");
    await runtime.invoke("open_project_document");
    expect(
      await runtime.invoke("get_generation_usage", {
        project_id: created.value.project_id,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            request_id: "portable",
            status: "completed",
            reported_microusd: null,
          },
        ],
      },
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM generation_usage").get(),
    ).toMatchObject({ count: 0 });
  } finally {
    await runtime.dispose();
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
