import { expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createGenerationUsageCommands } from "../../../electron/commands/generation-usage";
import { createGenerationPricingCommands } from "../../../electron/commands/generation-pricing";
import {
  composeFrameAction,
  editImageAction,
  generateAndSaveVideoRequestAction,
  generateImageAction,
} from "../../actions/generation-actions";
import type { GenerationCostEstimate } from "../../../shared/generation-cost";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), fetch: vi.fn() }));
vi.mock("../bridge", () => ({ invoke: mocks.invoke }));
vi.mock("../models/http", () => ({ fetch: mocks.fetch }));

const quoted: GenerationCostEstimate = {
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
  price_freshness: "live",
  excludes_input_cost: false,
};

it("runs an agent job through the app's image action with the quoted estimate and its own usage identity", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = {
      ...createGenerationUsageCommands(db),
      ...createGenerationPricingCommands(db),
    };
    commands.save_generation_price({
      kind: "image",
      price: {
        ...quoted.kind === "estimate" ? quoted.price : ({} as never),
        source_kind: "manual",
        source_url: "",
        rates: [{ unit: "image", microusd: 90_000 }],
      },
    });
    mocks.invoke.mockImplementation(async (command: string, args) =>
      command === "get_api_key" ? "fixture-key" : commands[command]?.(args),
    );
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "image-job",
          data: [{ b64_json: "aA==", media_type: "image/png" }],
          usage: { cost: 0.03 },
        }),
      ),
    );
    await generateImageAction(
      "A sock puppet detective",
      "seedream-4.5-openrouter",
      { project_id: "film", subject_id: "asset-1" },
      { request_id: "usage-7", agent_job_id: "job-1", estimate: quoted },
    );
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            request_id: "usage-7",
            agent_job_id: "job-1",
            subject_id: "asset-1",
            status: "completed",
            estimated_max_microusd: 30_000,
            price_source: "https://openrouter.ai/api/v1/models",
            reported_microusd: 30_000,
          },
        ],
      },
    });
  } finally {
    db.close();
  }
});

it("never calls the provider twice for the same agent usage identity", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> =
      createGenerationUsageCommands(db);
    mocks.invoke.mockImplementation(async (command: string, args) =>
      command === "get_api_key" ? "fixture-key" : commands[command]?.(args),
    );
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "x", data: [{ b64_json: "aA==", media_type: "image/png" }] }),
      ),
    );
    const accounting = { request_id: "usage-8", agent_job_id: "job-2", estimate: quoted };
    await generateImageAction("A", "seedream-4.5-openrouter", { project_id: "film" }, accounting);
    const calls = mocks.fetch.mock.calls.length;
    await expect(
      generateImageAction("A", "seedream-4.5-openrouter", { project_id: "film" }, accounting),
    ).rejects.toThrow(/already started/);
    expect(mocks.fetch.mock.calls.length).toBe(calls);
  } finally {
    db.close();
  }
});

it.each([
  ["edit", "image_edit"],
  ["compose", "image_compose"],
] as const)("runs an agent %s job with the quoted estimate and its own usage identity", async (operation, kind) => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> =
      createGenerationUsageCommands(db);
    mocks.invoke.mockImplementation(async (command: string, args) =>
      command === "get_api_key" ? "fixture-key" : commands[command]?.(args),
    );
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "x", data: [{ b64_json: "aA==", media_type: "image/png" }] }),
      ),
    );
    const accounting = { request_id: `usage-${operation}`, agent_job_id: `job-${operation}`, estimate: quoted };
    const subject = { project_id: "film", subject_id: "asset-1" };
    if (operation === "edit")
      await editImageAction("data:image/png;base64,aA==", "Add a hat", "seedream-4.5-openrouter", subject, accounting);
    else
      await composeFrameAction("Detective in office", ["data:image/png;base64,aA=="], "seedream-4.5-openrouter", subject, accounting);
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: {
        items: [
          { request_id: `usage-${operation}`, agent_job_id: `job-${operation}`, kind, estimated_max_microusd: 30_000 },
        ],
      },
    });
  } finally {
    db.close();
  }
});

it("runs an agent video job with the quoted estimate and its own usage identity", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> =
      createGenerationUsageCommands(db);
    mocks.invoke.mockImplementation(async (command: string, args) =>
      command === "get_api_key"
        ? "fixture-key"
        : command === "get_project_document_state"
          ? { ok: true, value: { current: { project_id: "film" }, recent: [] } }
          : commands[command]?.(args),
    );
    const videoQuote = { ...quoted, price: { ...(quoted.kind === "estimate" ? quoted.price : ({} as never)), model_id: "veo-3.1-openrouter" } };
    mocks.fetch.mockReset();
    mocks.fetch.mockRejectedValue(new Error("provider unreachable"));
    await generateAndSaveVideoRequestAction(
      "shot-1",
      "veo-3.1-openrouter",
      { mode: "text-to-video", prompt: "A door opens", settings: { duration: "8s", resolution: "720p", audio: false } },
      { request_id: "usage-video", agent_job_id: "job-video", estimate: videoQuote },
    );
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: { items: [{ request_id: "usage-video", agent_job_id: "job-video", kind: "video", estimated_max_microusd: 30_000 }] },
    });
  } finally {
    db.close();
  }
});

it("sends a video without an end frame when the request leaves it out", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> =
      createGenerationUsageCommands(db);
    mocks.invoke.mockImplementation(async (command: string, args) =>
      command === "get_api_key"
        ? "fixture-key"
        : command === "get_project_document_state"
          ? { ok: true, value: { current: { project_id: "film" }, recent: [] } }
          : command === "get_shot_end_frame_base64"
            ? "data:image/png;base64,END"
            : commands[command]?.(args),
    );
    mocks.fetch.mockReset();
    mocks.fetch.mockRejectedValue(new Error("provider unreachable"));
    await generateAndSaveVideoRequestAction("shot-1", "veo-3.1-openrouter", {
      mode: "image-to-video",
      prompt: "A door opens",
      settings: { duration: "8s", resolution: "720p", audio: false },
      startImage: "data:image/png;base64,START",
      endImage: null,
    });
    expect(mocks.invoke.mock.calls.map(([command]) => command)).not.toContain("get_shot_end_frame_base64");
    expect(commands.get_generation_usage({ project_id: "film" })).toMatchObject({
      ok: true,
      value: { items: [{ settings: { has_end_frame: false } }] },
    });
  } finally {
    db.close();
  }
});
