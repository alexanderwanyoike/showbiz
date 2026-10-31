import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, loadMigrations } from "../db";
import { createDataCommands } from "../command-map";
import { createInvokeHandler } from "../ipc";
import { createMcpSession } from "./session";

const root = mkdtempSync(path.join(tmpdir(), "showbiz-mcp-test-"));
afterEach(() => rmSync(root, { recursive: true, force: true }));
it("shares live project operations with the UI and guards remote retries and stale revisions", async () => {
  const db = openDatabase(":memory:", loadMigrations(path.resolve("electron/migrations")));
  try {
    const commands = createDataCommands(db, root, {} as Parameters<typeof createDataCommands>[2]);
    const changed = vi.fn();
    const session = createMcpSession(createInvokeHandler(commands), changed);
    const request = { tool: "create_project", args: { name: "A quiet morning", expected_revision: 0, request_id: "create-project" } };
    const result = await session.call(request);
    expect(result).toMatchObject({ ok: true, value: { revision: 1, data: { name: "A quiet morning" } } });
    expect(await session.call(request)).toEqual(result);
    expect(commands.get_projects()).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(1);
    await session.invoke("create_project", { name: "Manual project" });
    expect(await session.call({ tool: "create_project", args: { name: "Stale", expected_revision: 1, request_id: "stale" } })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await session.call({ tool: "get_api_key", args: { provider: "gemini" } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  } finally { db.close(); }
});
