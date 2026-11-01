import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createTestDataCommands } from "../test-support/data-commands";
import { createInvokeHandler } from "../ipc";
import { createMcpSession } from "./session";
import { mcpTools } from "./tools";
it("filters usage and totals by subject through the native command boundary without advertising summary pagination", async () => {
  const db = openTestDb();
  try {
    const commands = createTestDataCommands(db, "/unused");
    const project = commands.create_project({ name: "Film" });
    for (const subject_id of ["shot-a", "shot-b"])
      commands.begin_generation_usage({
        request_id: subject_id,
        project_id: project.id,
        subject_id,
        kind: "image",
        provider: "local",
        model_id: "local-image",
      });
    const session = createMcpSession(createInvokeHandler(commands));
    expect(
      await session.call({
        tool: "get_generation_usage",
        args: { project_id: project.id, subject_id: "shot-a", limit: 1 },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        data: {
          ok: true,
          value: { total_count: 1, items: [{ subject_id: "shot-a" }] },
        },
      },
    });
    expect(
      await session.call({
        tool: "get_generation_cost_summary",
        args: { project_id: project.id, subject_id: "shot-b" },
      }),
    ).toMatchObject({
      ok: true,
      value: { data: { ok: true, value: { total_count: 1 } } },
    });
    const summary = mcpTools.find(
      (tool) => tool.name === "get_generation_cost_summary",
    );
    expect(
      summary?.schema.safeParse({
        project_id: project.id,
        offset: 10,
        limit: 1,
      }).success,
    ).toBe(false);
  } finally {
    db.close();
  }
});
