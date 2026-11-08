import { expect, it, vi } from "vitest";
import { createMcpSession } from "./session";
import { mcpTools } from "./tools";

it("exposes job tools whose retries are guarded by the job ledger, not the edit replay window", async () => {
  const dispatch = vi.fn(async (command: string, args?: Record<string, unknown>) => ({
    ok: true,
    value: { command, args },
  }));
  const session = createMcpSession(dispatch, () => {}, () => false);
  const generate = mcpTools.find((tool) => tool.name === "generate");
  expect(generate).toMatchObject({ command: "generate", mutates: false, spends: true, openWorld: true });
  const args = {
    target: "bible_asset",
    operation: "generate",
    asset_id: "asset-1",
    prompt: "A sock puppet detective",
    model_id: "flux-kontext-fal",
    request_id: "agent-request-1",
  };
  for (const attempt of [1, 2])
    expect(await session.call({ tool: "generate", args })).toMatchObject({
      ok: true,
      value: { data: { ok: true, value: { command: "generate", args } } },
    });
  expect(dispatch).toHaveBeenCalledTimes(2);
  expect(
    await session.call({ tool: "get_generation_job", args: { job_id: "job-1" } }),
  ).toMatchObject({ ok: true, value: { data: { value: { args: { job_id: "job-1" } } } } });
  expect(
    await session.call({
      tool: "list_generation_jobs",
      args: { project_id: "film", offset: 0, limit: 10 },
    }),
  ).toMatchObject({
    ok: true,
    value: { data: { value: { args: { project_id: "film", offset: 0, limit: 10 } } } },
  });
});

it("still guards ordinary edits with revisions and unsaved-work checks", async () => {
  const session = createMcpSession(async () => ({}), () => {}, () => false);
  expect(
    await session.call({
      tool: "update_project",
      args: { id: "p", name: "New", expected_revision: 0, request_id: "edit-1" },
    }),
  ).toMatchObject({ ok: false, error: { code: "BUSY" } });
});

it("exposes set_shot_frame as an ordinary guarded edit", () => {
  const tool = mcpTools.find((entry) => entry.name === "set_shot_frame");
  expect(tool).toMatchObject({ mutates: true, command: "set_shot_frame" });
  expect(tool?.schema.safeParse({ shot_id: "s", role: "middle", bible_variant_id: "v", expected_revision: 0, request_id: "r" }).success).toBe(false);
});

it("exposes shot video settings as an ordinary guarded edit and video quotes", () => {
  expect(mcpTools.find((entry) => entry.name === "set_shot_video_settings")).toMatchObject({
    mutates: true,
    command: "set_shot_video_settings",
  });
  const generate = mcpTools.find((entry) => entry.name === "generate");
  expect(
    generate?.schema.safeParse({ target: "shot_video", operation: "generate", shot_id: "s", request_id: "r" }).success,
  ).toBe(true);
  expect(generate?.schema.safeParse({ target: "shot_video", operation: "generate", shot_id: "s" }).success).toBe(false);
});

it("offers no budget, quote or submit step before generating", () => {
  const names = mcpTools.map((tool) => tool.name);
  for (const dropped of ["get_agent_budget", "quote_generation", "submit_generation"])
    expect(names).not.toContain(dropped);
  expect(names).toEqual(expect.arrayContaining(["generate", "get_generation_job", "list_generation_jobs"]));
});
