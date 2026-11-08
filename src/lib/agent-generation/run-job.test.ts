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
