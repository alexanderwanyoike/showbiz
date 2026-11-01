import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, loadMigrations } from "../db";
import { createTestDataCommands as createDataCommands } from "../test-support/data-commands";
import { createInvokeHandler } from "../ipc";
import { createMcpSession } from "./session";

const root = mkdtempSync(path.join(tmpdir(), "showbiz-mcp-test-"));
afterEach(() => rmSync(root, { recursive: true, force: true }));
it("shares live project operations with the UI and guards remote retries and stale revisions", async () => {
  const db = openDatabase(
    ":memory:",
    loadMigrations(path.resolve("electron/migrations")),
  );
  try {
    const commands = createDataCommands(
      db,
      root,
      {},
    );
    const changed = vi.fn();
    const session = createMcpSession(createInvokeHandler(commands), changed);
    const request = {
      tool: "create_project",
      args: {
        name: "A quiet morning",
        expected_revision: 0,
        request_id: "create-project",
      },
    };
    const result = await session.call(request);
    expect(result).toMatchObject({
      ok: true,
      value: { revision: 1, data: { name: "A quiet morning" } },
    });
    expect(await session.call(request)).toEqual(result);
    expect(commands.get_projects()).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(1);
    await session.invoke("create_project", { name: "Manual project" });
    expect(
      await session.call({
        tool: "create_project",
        args: { name: "Stale", expected_revision: 1, request_id: "stale" },
      }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(
      await session.call({ tool: "get_api_key", args: { provider: "gemini" } }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  } finally {
    db.close();
  }
});

it("does not overwrite a user's unsaved work when an agent requests a mutation", async () => {
  const dispatch = vi.fn(async () => ({ id: "p", name: "Agent project" }));
  const session = createMcpSession(
    dispatch,
    () => {},
    () => false,
  );
  expect(
    await session.call({
      tool: "create_project",
      args: {
        name: "Agent project",
        expected_revision: 0,
        request_id: "blocked",
      },
    }),
  ).toMatchObject({ ok: false, error: { code: "BUSY" } });
  expect(dispatch).not.toHaveBeenCalled();
});

it("reports native Result failures as MCP errors instead of a successful export", async () => {
  const session = createMcpSession(async () => ({
    ok: false,
    error: { code: "IO_ERROR", message: "Missing shot media" },
  }));
  expect(
    await session.call({
      tool: "export_storyboard_package",
      args: {
        storyboard_id: "sb",
        format: "sbz",
        expected_revision: 0,
        request_id: "export",
      },
    }),
  ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
});

it("keeps a completed edit successful if a window closes before its refresh notification", async () => {
  const changed = vi.fn(() => {
    throw new Error("Window already closed");
  });
  const session = createMcpSession(
    async () => ({ id: "p", name: "Saved" }),
    changed,
  );
  expect(
    await session.call({
      tool: "create_project",
      args: { name: "Saved", expected_revision: 0, request_id: "saved" },
    }),
  ).toMatchObject({ ok: true, value: { revision: 1 } });
});

it("expires edit retries when the UI switches project files", async () => {
  const session = createMcpSession(async (command) =>
    command === "open_project_document"
      ? { ok: true, value: { file_path: "/Films/Second.showbiz" } }
      : { id: "first", name: "First" },
  );
  const request = {
    tool: "update_project",
    args: {
      id: "first",
      name: "First",
      expected_revision: 0,
      request_id: "old-file-edit",
    },
  };
  expect((await session.call(request)).ok).toBe(true);
  await session.invoke("open_project_document");
  expect(await session.call(request)).toMatchObject({
    ok: false,
    error: { code: "CONFLICT" },
  });
});

it("reads project usage through agents without exposing receipt-writing or credential commands", async () => {
  const db = openDatabase(
    ":memory:",
    loadMigrations(path.resolve("electron/migrations")),
  );
  try {
    const commands = createDataCommands(db, root, {});
    const project = commands.create_project({ name: "Usage film" });
    commands.begin_generation_usage({
      request_id: "receipt",
      project_id: project.id,
      kind: "image",
      provider: "fal",
      model_id: "image",
    });
    const session = createMcpSession(createInvokeHandler(commands));
    expect(
      await session.call({
        tool: "get_generation_usage",
        args: { project_id: project.id, limit: 1, offset: 0 },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        data: {
          ok: true,
          value: { items: [{ request_id: "receipt" }], total_count: 1 },
        },
      },
    });
    expect(
      await session.call({
        tool: "record_generation_receipt",
        args: { request_id: "receipt", reported_microusd: 0 },
      }),
    ).toMatchObject({ ok: false });
  } finally {
    db.close();
  }
});
