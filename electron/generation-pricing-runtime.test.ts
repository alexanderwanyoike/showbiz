import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { loadMigrations } from "./db";
import { createProjectRuntime } from "./project-runtime";

it("keeps price overrides on the device before, during and after a project is open", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-price-runtime-"),
  );
  const db = openTestDb();
  const runtime = createProjectRuntime({
    appDirectory: directory,
    legacyDb: db,
    migrations: loadMigrations(path.resolve("electron/migrations")),
    exports: () => ({}),
    chooseOpen: async () => null,
    chooseSave: async (name) => path.join(directory, name),
    canSwitch: () => true,
    beginSave: () => () => {},
    changed: () => {},
  });
  try {
    const price = {
      provider: "gemini",
      model_id: "nano-banana-2",
      currency: "USD",
      source_kind: "manual",
      source_url: "https://ai.google.dev/gemini-api/docs/pricing",
      checked_at: "2026-10-31T12:00:00Z",
      rates: [{ unit: "image", microusd: 50000 }],
    };
    expect(
      await runtime.invoke("save_generation_price", { kind: "image", price }),
    ).toMatchObject({ ok: true });
    await runtime.invoke("create_project_document");
    expect(
      await runtime.invoke("get_generation_price", {
        kind: "image",
        model_id: "nano-banana-2",
      }),
    ).toMatchObject({ ok: true, value: { rates: [{ microusd: 50000 }] } });
    await runtime.invoke("close_project_document");
    expect(
      await runtime.invoke("get_generation_price", {
        kind: "image",
        model_id: "nano-banana-2",
      }),
    ).toMatchObject({ ok: true, value: { rates: [{ microusd: 50000 }] } });
  } finally {
    await runtime.dispose();
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
