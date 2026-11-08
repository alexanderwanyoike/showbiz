import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createTestDataCommands } from "../../../electron/test-support/data-commands";
import { createGenerationUsageCommands } from "../../../electron/commands/generation-usage";
import type { AgentJobStart } from "../../../shared/agent-generation";
import { runAgentJob } from "./run-job";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), fetch: vi.fn() }));
vi.mock("../bridge", () => ({ invoke: mocks.invoke }));
vi.mock("../models/http", () => ({ fetch: mocks.fetch }));
vi.mock("../electron-media-url", () => ({
  electronMediaUrlResolver: { resolve: async () => "blob:fixture", invalidate: () => {} },
}));
vi.mock("../bible-takes", async (original) => ({
  ...(await original<typeof import("../bible-takes")>()),
  prepareBibleImageDataUrl: async (dataUrl: string) => dataUrl,
}));
afterEach(() => {
  mocks.invoke.mockReset();
  mocks.fetch.mockReset();
});

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function project(apiKey: string | null) {
  const db = openTestDb();
  const media = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-agent-job-"));
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = {
    ...createTestDataCommands(db, media),
    ...createGenerationUsageCommands(db),
  };
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const [bible] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
  const asset = commands.create_bible_asset({
    bibleId: bible.id,
    input: { asset_type: "character", name: "Sock detective", consent_confirmed: false },
  }) as { id: string };
  mocks.invoke.mockImplementation(async (command: string, args) =>
    command === "get_api_key" ? apiKey : commands[command]?.(args),
  );
  mocks.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "provider-request-1",
        data: [{ b64_json: PNG, media_type: "image/png" }],
        usage: { cost: 0.03 },
      }),
    ),
  );
  const job: AgentJobStart = {
    job_id: "job-1",
    usage_request_id: "usage-1",
    request: {
      target: "bible_asset",
      operation: "generate",
      asset_id: asset.id,
      prompt: "A tired sock puppet detective",
      model_id: "seedream-4.5-openrouter",
    },
    plan: {
      model_id: "seedream-4.5-openrouter",
      provider: "openrouter",
      cost_request: { kind: "image", count: 1 },
      subject: { project_id: film.id, subject_id: asset.id },
      inputs: { prompt: "A tired sock puppet detective", reference_variant_ids: [] },
      estimate: {
        kind: "estimate",
        min_microusd: 30_000,
        max_microusd: 30_000,
        price: {
          provider: "openrouter",
          model_id: "seedream-4.5-openrouter",
          currency: "USD",
          source_kind: "provider",
          source_url: "https://openrouter.ai/api/v1/models",
          checked_at: "2026-11-08T10:00:00.000Z",
          rates: [{ unit: "image", microusd: 30_000 }],
        },
        stale: false,
        excludes_input_cost: false,
      },
    },
  };
  return { commands, film, asset, job };
}

it("generates a Bible picture where the app puts it, with the agent's usage record", async () => {
  const { commands, film, asset, job } = project("fixture-key");
  const report = vi.fn(async () => undefined);
  await runAgentJob(job, report);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const variants = commands.get_bible_asset_variants({ assetId: asset.id }) as {
    id: string;
    is_primary: boolean;
    status: string;
    source_kind: string;
    prompt: string;
    model_id: string;
  }[];
  expect(variants).toMatchObject([
    {
      is_primary: true,
      status: "approved",
      source_kind: "generated",
      prompt: "A tired sock puppet detective",
      model_id: "seedream-4.5-openrouter",
    },
  ]);
  expect(report.mock.calls).toEqual([
    [{ job_id: "job-1", status: "running" }],
    [
      {
        job_id: "job-1",
        status: "completed",
        result: { variant_id: variants[0].id },
        warnings: [],
      },
    ],
  ]);
  expect(commands.get_generation_usage({ project_id: film.id })).toMatchObject({
    ok: true,
    value: {
      items: [
        {
          request_id: "usage-1",
          agent_job_id: "job-1",
          subject_id: asset.id,
          status: "completed",
          estimated_max_microusd: 30_000,
          reported_microusd: 30_000,
          provider_request_id: "provider-request-1",
        },
      ],
    },
  });
});

it("reports a failure without calling the provider when no key is configured", async () => {
  const { commands, film, job } = project(null);
  const report = vi.fn(async () => undefined);
  await runAgentJob(job, report);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(report).toHaveBeenLastCalledWith({
    job_id: "job-1",
    status: "failed",
    error: expect.stringContaining("API key is not configured") as string,
  });
  expect(commands.get_generation_usage({ project_id: film.id })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
});

it.each(["retake", "edit"] as const)("runs a %s job and makes the result the entry's current picture", async (operation) => {
  const { commands, asset, job } = project("fixture-key");
  const source = commands.create_bible_asset_variant({
    assetId: asset.id,
    input: { name: "first", image_base64: `data:image/png;base64,${PNG}`, source_kind: "generated", status: "approved", prompt: "first", is_primary: true },
  }) as { id: string };
  const report = vi.fn(async () => undefined);
  await runAgentJob(
    {
      ...job,
      request:
        operation === "edit"
          ? { target: "bible_asset", operation, asset_id: asset.id, source_variant_id: source.id, prompt: "Add a hat", model_id: "seedream-4.5-openrouter" }
          : { target: "bible_asset", operation, asset_id: asset.id, model_id: "seedream-4.5-openrouter" },
      plan: {
        ...job.plan,
        cost_request: { kind: operation === "edit" ? "image_edit" : "image_compose", count: 1 },
        inputs:
          operation === "edit"
            ? { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: source.id }
            : { prompt: "first", reference_variant_ids: [source.id] },
      },
    },
    report,
  );
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
  const body = JSON.parse(String(mocks.fetch.mock.calls[0][1]?.body ?? "{}")) as unknown;
  expect(JSON.stringify(body)).toContain(PNG.slice(0, 20));
  const variants = commands.get_bible_asset_variants({ assetId: asset.id }) as { id: string; is_primary: boolean; prompt: string }[];
  expect(variants.find((variant) => variant.is_primary)).toMatchObject({
    prompt: operation === "edit" ? "Add a hat" : "first",
  });
  expect(variants).toHaveLength(2);
});

it("fails a retake job instead of composing from fewer pictures than were quoted", async () => {
  const { commands, asset, job } = project("fixture-key");
  const report = vi.fn(async () => undefined);
  await runAgentJob(
    {
      ...job,
      request: { target: "bible_asset", operation: "retake", asset_id: asset.id, model_id: "seedream-4.5-openrouter" },
      plan: {
        ...job.plan,
        cost_request: { kind: "image_compose", count: 1 },
        inputs: { prompt: "first", reference_variant_ids: ["deleted-picture"] },
      },
    },
    report,
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
  expect(commands.get_bible_asset_variants({ assetId: asset.id })).toEqual([]);
});

it("edits the source picture frozen in the quote", async () => {
  const { commands, asset, job } = project("fixture-key");
  const take = (prompt: string) =>
    commands.create_bible_asset_variant({
      assetId: asset.id,
      input: { name: prompt, image_base64: `data:image/png;base64,${PNG}`, source_kind: "generated", status: "approved", prompt, is_primary: true },
    }) as { id: string };
  const frozen = take("frozen");
  const report = vi.fn(async () => undefined);
  await runAgentJob(
    {
      ...job,
      request: { target: "bible_asset", operation: "edit", asset_id: asset.id, source_variant_id: "not-the-frozen-one", prompt: "Add a hat", model_id: "seedream-4.5-openrouter" },
      plan: {
        ...job.plan,
        cost_request: { kind: "image_edit", count: 1 },
        inputs: { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: frozen.id },
      },
    },
    report,
  );
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
});

it.each(["generate", "edit"] as const)("runs a shot start frame %s job as a new current take", async (operation) => {
  const { commands, film, job } = project("fixture-key");
  const board = commands.create_storyboard({ projectId: film.id, name: "Opening" }) as { id: string };
  const shot = commands.create_shot({ storyboardId: board.id }) as { id: string };
  const first = commands.create_generation_version({ shotId: shot.id, prompt: "First", imageBase64: `data:image/png;base64,${PNG}`, parentVersionId: null }) as { id: string };
  const report = vi.fn(async () => undefined);
  await runAgentJob(
    {
      ...job,
      request:
        operation === "edit"
          ? { target: "shot_start_frame", operation, shot_id: shot.id, source_take_id: first.id, prompt: "Darker" }
          : { target: "shot_start_frame", operation, shot_id: shot.id, prompt: "Sock enters" },
      plan: {
        ...job.plan,
        cost_request: { kind: operation === "edit" ? "image_edit" : "image", count: 1 },
        subject: { project_id: film.id, subject_id: shot.id },
        inputs:
          operation === "edit"
            ? { prompt: "Darker", reference_variant_ids: [], source_take_id: first.id }
            : { prompt: "Sock enters", reference_variant_ids: [] },
      },
    },
    report,
  );
  const versions = commands.get_image_versions({ shotId: shot.id }) as { version: { id: string; is_current: boolean; parent_version_id: string | null } ; children: { version: { id: string; is_current: boolean; parent_version_id: string | null } }[] }[];
  const all = versions.flatMap((node) => [node.version, ...node.children.map((child) => child.version)]);
  const current = all.find((version) => version.is_current);
  expect(current).toMatchObject({ parent_version_id: first.id });
  expect(report).toHaveBeenLastCalledWith({
    job_id: "job-1",
    status: "completed",
    result: { take_id: current?.id },
    warnings: [],
  });
});
