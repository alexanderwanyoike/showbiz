import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
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

it("reconciles an open document with the device provider key rather than a portable project setting", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-billing-runtime-"));
  const db = openTestDb();
  const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ billing_events: [{ request_id: "fal-job", cost_total: 0.02 }], has_more: false, next_cursor: null })));
  vi.stubGlobal("fetch", http);
  const runtime = createProjectRuntime({ appDirectory: directory, legacyDb: db, migrations: loadMigrations(path.resolve("electron/migrations")), exports: () => ({}), chooseOpen: async () => null, chooseSave: async (name) => path.join(directory, name), canSwitch: () => true, beginSave: () => () => {}, changed: () => {} });
  try {
    await runtime.invoke("save_api_key", { provider: "fal", apiKey: "device-only-key" });
    await runtime.invoke("create_project_document");
    const projects = await runtime.invoke("get_projects") as { id: string }[];
    const project_id = projects[0].id;
    await runtime.invoke("begin_generation_usage", { project_id, request_id: "ours", provider: "fal", model_id: "flux-dev-fal", kind: "image" });
    await runtime.invoke("record_generation_receipt", { request_id: "ours", provider_request_id: "fal-job", reported_microusd: null });
    await runtime.invoke("finish_generation_usage", { request_id: "ours", status: "completed" });
    expect(await runtime.invoke("sync_generation_charges", { project_id })).toMatchObject({ ok: true, value: { reported: 1 } });
    expect(new Headers(http.mock.calls[0][1]?.headers).get("authorization")).toBe("Key device-only-key");
    const state = await runtime.invoke("get_project_document_state") as { ok: true; value: { current: { file_path: string } } };
    await runtime.invoke("close_project_document");
    await runtime.invoke("open_project_document", { file_path: state.value.current.file_path });
    expect(await runtime.invoke("get_generation_cost_summary", { project_id })).toMatchObject({ ok: true, value: { reported_microusd: 20000 } });
  } finally { await runtime.dispose(); db.close(); fs.rmSync(directory, {recursive:true,force:true}); vi.unstubAllGlobals(); }
});
