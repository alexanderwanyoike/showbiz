import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { loadMigrations } from "../db";
import { createProjectRuntime } from "../project-runtime";
import { createMcpSession } from "./session";
import { mcpTools } from "./tools";

const grantMutations = ["grant_agent_budget", "revoke_agent_budget"];

let saves = 0;
function runtime() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-budget-"));
  return createProjectRuntime({
    modelDirectory: path.resolve("src/lib/models/providers"),
    appDirectory: directory,
    legacyDb: openTestDb(),
    migrations: loadMigrations(path.resolve("electron/migrations")),
    exports: () => ({}),
    chooseOpen: async () => null,
    chooseSave: async (name) => path.join(directory, `${saves++}-${name}`),
    canSwitch: () => true,
    beginSave: () => () => {},
    changed: () => {},
  });
}

it("lets an agent read the budget the user granted in the app", async () => {
  const app = runtime();
  const session = createMcpSession((command, args) => app.invoke(command, args));
  expect(
    await session.call({ tool: "get_agent_budget", args: {} }),
  ).toMatchObject({ ok: false, error: { code: "NO_BUDGET" } });
  await app.invoke("grant_agent_budget", {
    max_microusd: 2_000_000,
    duration_minutes: 60,
  });
  expect(
    await session.call({ tool: "get_agent_budget", args: {} }),
  ).toMatchObject({
    ok: true,
    value: {
      data: {
        ok: true,
        value: { remaining_microusd: 2_000_000, grant: { revoked_at: null } },
      },
    },
  });
});

it("never exposes a tool that can create, raise, extend or revoke a budget", async () => {
  expect(
    mcpTools.filter((tool) => grantMutations.includes(tool.command)),
  ).toEqual([]);
  const budgetTools = mcpTools.filter((tool) => tool.command.includes("budget"));
  expect(budgetTools.map((tool) => [tool.command, tool.mutates])).toEqual([
    ["get_agent_budget", false],
  ]);
  const app = runtime();
  const session = createMcpSession((command, args) => app.invoke(command, args));
  for (const tool of grantMutations)
    expect(
      await session.call({
        tool,
        args: {
          max_microusd: 1_000_000,
          duration_minutes: 60,
          expected_revision: 0,
          request_id: tool,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await app.invoke("get_agent_budget")).toMatchObject({
    ok: false,
    error: { code: "NO_BUDGET" },
  });
});

it("leaves a granted budget unchanged after every MCP tool command (exposure itself is guarded by the allowlist test)", async () => {
  const app = runtime();
  await app.invoke("create_project_document");
  await app.invoke("grant_agent_budget", {
    max_microusd: 2_000_000,
    duration_minutes: 60,
  });
  const before = JSON.stringify(await app.invoke("get_agent_budget"));
  const hostile = {
    id: "agent_budget_grant",
    key: "agent_budget_grant",
    max_microusd: 999_000_000,
    per_request_cap_microusd: 999_000_000,
    duration_minutes: 60 * 24 * 30,
    allowed_models: null,
    revoked_at: null,
    name: "agent_budget_grant",
  };
  for (const tool of mcpTools) {
    await Promise.resolve(app.invoke(tool.command, hostile)).catch(() => null);
    expect(JSON.stringify(await app.invoke("get_agent_budget"))).toBe(before);
  }
});

it("keeps the budget out of project documents and Save As copies", async () => {
  const app = runtime();
  await app.invoke("grant_agent_budget", {
    max_microusd: 2_000_000,
    duration_minutes: 60,
  });
  const created = (await app.invoke("create_project_document")) as {
    ok: true;
    value: { file_path: string };
  };
  await app.invoke("save_project_document");
  const copy = (await app.invoke("save_project_document_as")) as {
    ok: true;
    value: { file_path: string };
  };
  expect(copy.value.file_path).not.toBe(created.value.file_path);
  for (const file of [created.value.file_path, copy.value.file_path]) {
    const document = new DatabaseSync(file, { readOnly: true });
    try {
      expect(
        document
          .prepare("SELECT key FROM settings WHERE key LIKE '%budget%'")
          .all(),
      ).toEqual([]);
    } finally {
      document.close();
    }
  }
});
