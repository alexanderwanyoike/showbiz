import { describe, expect, it, vi } from "vitest";
import type { AgentBudget } from "../../shared/agent-budget";
import type { AgentQuotePlan } from "../../shared/agent-generation";
import type { GenerationPrice } from "../../shared/generation-cost";
import { createAgentQuotes } from "./quotes";

const price: GenerationPrice = {
  provider: "fal",
  model_id: "flux-dev-fal",
  currency: "USD",
  source_kind: "provider",
  source_url: "https://fal.ai/docs",
  checked_at: "2026-11-08T09:59:00.000Z",
  endpoint_id: "fal-ai/flux/dev",
  estimate_basis: "historical_request",
  rates: [{ unit: "request", microusd: 25_000 }],
};
const plan = (overrides: Partial<AgentQuotePlan> = {}): AgentQuotePlan => ({
  model_id: "flux-dev-fal",
  provider: "fal",
  cost_request: { kind: "image", count: 1 },
  subject: { project_id: "film", subject_id: "asset-1" },
  inputs: { prompt: "A tired sock puppet detective", reference_variant_ids: [] },
  estimate: {
    kind: "estimate",
    min_microusd: 25_000,
    max_microusd: 25_000,
    price,
    stale: false,
    price_freshness: "live",
    excludes_input_cost: false,
  },
  ...overrides,
});
const budget = (overrides: Partial<AgentBudget["grant"]> = {}, remaining = 5_000_000): AgentBudget => ({
  grant: {
    id: "grant-1",
    max_microusd: 5_000_000,
    per_request_cap_microusd: 1_000_000,
    allowed_models: null,
    granted_at: "2026-11-08T09:00:00.000Z",
    expires_at: "2026-11-09T09:00:00.000Z",
    revoked_at: null,
    ...overrides,
  },
  committed_microusd: 5_000_000 - remaining,
  remaining_microusd: remaining,
  frozen: false,
});
const request = {
  target: "bible_asset",
  operation: "generate",
  asset_id: "asset-1",
  prompt: "A tired sock puppet detective",
  model_id: "flux-dev-fal",
};

function setup(options: {
  planned?: Awaited<ReturnType<Parameters<typeof createAgentQuotes>[0]["plan"]>>;
  granted?: AgentBudget | null;
  afterPlanning?: AgentBudget | null;
} = {}) {
  let planned = false;
  let now = Date.parse("2026-11-08T10:00:00.000Z");
  const planner = vi.fn(async () => {
    planned = true;
    return options.planned ?? { ok: true as const, value: plan() };
  });
  const quotes = createAgentQuotes({
    plan: planner,
    resolve: async () => options.planned ?? { ok: true as const, value: plan() },
    budget: async () => {
      const current =
        planned && options.afterPlanning !== undefined
          ? options.afterPlanning
          : options.granted;
      return current === null
        ? { ok: false, error: { code: "NO_BUDGET", message: "none" } }
        : { ok: true, value: current ?? budget() };
    },
    now: () => now,
  });
  return { quotes, planner, advance: (ms: number) => (now += ms) };
}

describe("agent generation quotes", () => {
  it("freezes the estimate the app would show and expires after ten minutes", async () => {
    const { quotes, planner } = setup();
    const quoted = await quotes.quote_generation(request);
    expect(planner).toHaveBeenCalledWith(request);
    expect(quoted).toEqual({
      ok: true,
      value: {
        quote_id: expect.any(String) as string,
        expires_at: "2026-11-08T10:10:00.000Z",
        model_id: "flux-dev-fal",
        provider: "fal",
        kind: "image",
        min_microusd: 25_000,
        max_microusd: 25_000,
        price_source: "https://fal.ai/docs",
        price_checked_at: "2026-11-08T09:59:00.000Z",
        price_freshness: "live",
        price_stale: false,
        price_basis: price,
        excludes_input_cost: false,
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
        budget_remaining_microusd: 5_000_000,
      },
    });
  });

  it("refuses without an active budget before asking for a price", async () => {
    const { quotes, planner } = setup({ granted: null });
    expect(await quotes.quote_generation(request)).toMatchObject({
      ok: false,
      error: { code: "NO_BUDGET" },
    });
    expect(planner).not.toHaveBeenCalled();
  });

  it("rejects malformed requests", async () => {
    const { quotes, planner } = setup();
    expect(
      await quotes.quote_generation({ ...request, prompt: "  " }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(
      await quotes.quote_generation({ ...request, target: "storyboard" }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(planner).not.toHaveBeenCalled();
  });

  it("never treats an unknown price as free", async () => {
    const { quotes } = setup({
      planned: {
        ok: true,
        value: plan({
          estimate: {
            kind: "unavailable",
            reason: "The provider returned a zero historical estimate.",
          },
        }),
      },
    });
    expect(await quotes.quote_generation(request)).toEqual({
      ok: false,
      error: {
        code: "PRICE_UNKNOWN",
        message:
          "The provider returned a zero historical estimate. Paid generation needs a known price.",
      },
    });
  });

  it("refuses models outside the allowlist", async () => {
    const { quotes } = setup({
      granted: budget({ allowed_models: ["nano-banana-2"] }),
    });
    expect(await quotes.quote_generation(request)).toMatchObject({
      ok: false,
      error: { code: "MODEL_NOT_ALLOWED" },
    });
  });

  it("refuses an amount over the per-request cap or the remaining budget", async () => {
    expect(
      await setup({ granted: budget({ per_request_cap_microusd: 20_000 }) }).quotes.quote_generation(request),
    ).toMatchObject({ ok: false, error: { code: "OVER_REQUEST_CAP" } });
    expect(
      await setup({ granted: budget({}, 10_000) }).quotes.quote_generation(request),
    ).toMatchObject({ ok: false, error: { code: "OVER_BUDGET" } });
  });

  it("passes on planning failures such as a missing asset", async () => {
    const { quotes } = setup({
      planned: { ok: false, error: { code: "NOT_FOUND", message: "No such Bible entry." } },
    });
    expect(await quotes.quote_generation(request)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such Bible entry." },
    });
  });

  it("hands out a quote once, and never after it expires", async () => {
    const { quotes, advance } = setup();
    const first = await quotes.quote_generation(request);
    const second = await quotes.quote_generation(request);
    if (!first.ok || !second.ok) throw new Error("expected quotes");
    expect(quotes.take(first.value.quote_id)).toMatchObject({
      ok: true,
      value: {
        request,
        plan: plan(),
        max_microusd: 25_000,
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
      },
    });
    expect(quotes.take(first.value.quote_id)).toMatchObject({
      ok: false,
      error: { code: "QUOTE_NOT_FOUND" },
    });
    advance(10 * 60 * 1000);
    expect(quotes.take(second.value.quote_id)).toMatchObject({
      ok: false,
      error: { code: "QUOTE_EXPIRED" },
    });
  });

  it("checks the budget again after a slow price lookup", async () => {
    expect(
      await setup({ afterPlanning: null }).quotes.quote_generation(request),
    ).toMatchObject({ ok: false, error: { code: "NO_BUDGET" } });
    expect(
      await setup({ afterPlanning: budget({}, 10_000) }).quotes.quote_generation(request),
    ).toMatchObject({ ok: false, error: { code: "OVER_BUDGET" } });
  });

  it.each([
    ["a non-numeric amount", plan({ estimate: { ...estimateOf(plan()), max_microusd: Number.NaN } })],
    ["a negative amount", plan({ estimate: { ...estimateOf(plan()), min_microusd: -5, max_microusd: -1 } })],
    ["a minimum above the maximum", plan({ estimate: { ...estimateOf(plan()), min_microusd: 30_000 } })],
    ["another model", plan({ model_id: "nano-banana-2" })],
    ["another kind of generation", plan({ cost_request: { kind: "video", duration: 8 } })],
    ["another subject", plan({ subject: { project_id: "film", subject_id: "asset-2" } })],
    ["a malformed cost request", plan({ cost_request: { kind: "image", count: "lots" } as never })],
    ["another model's price", plan({ estimate: { ...estimateOf(plan()), price: { ...price, model_id: "nano-banana-2" } } })],
  ])("rejects a planned quote with %s", async (_label, malformed) => {
    expect(
      await setup({ planned: { ok: true, value: malformed } }).quotes.quote_generation(request),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("rejects an answer that is not a plan at all", async () => {
    expect(
      await setup({
        planned: { ok: true, value: { model_id: "flux-dev-fal" } as unknown as AgentQuotePlan },
      }).quotes.quote_generation(request),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("refuses a budget frozen by a charge above its quote", async () => {
    const { quotes, planner } = setup({ granted: { ...budget(), frozen: true } });
    expect(await quotes.quote_generation(request)).toMatchObject({
      ok: false,
      error: { code: "NO_BUDGET" },
    });
    expect(planner).not.toHaveBeenCalled();
  });

  it("matches each operation to the kind of generation it prices", async () => {
    const retake = { target: "bible_asset", operation: "retake", asset_id: "asset-1", model_id: "flux-dev-fal" };
    const composed = plan({
      cost_request: { kind: "image_compose", count: 1 },
      inputs: { prompt: "Sock again", reference_variant_ids: ["v1"] },
    });
    expect(
      await setup({ planned: { ok: true, value: composed } }).quotes.quote_generation(retake),
    ).toMatchObject({ ok: true, value: { kind: "image_compose" } });
    const edit = { ...retake, operation: "edit", source_variant_id: "v1", prompt: "Add a hat" };
    expect(
      await setup({ planned: { ok: true, value: plan({ inputs: { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: "v1" } }) } }).quotes.quote_generation(edit),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
    expect(
      await setup({
        planned: {
          ok: true,
          value: plan({
            cost_request: { kind: "image_edit", count: 1 },
            inputs: { prompt: "Add a hat", reference_variant_ids: [], source_variant_id: "other" },
          }),
        },
      }).quotes.quote_generation(edit),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("quotes a shot start frame with the model the shot resolves to", async () => {
    const shotRequest = { target: "shot_start_frame", operation: "generate", shot_id: "shot-1", prompt: "Sock enters" };
    const shotPlan = plan({
      subject: { project_id: "film", subject_id: "shot-1" },
      inputs: { prompt: "Sock enters", reference_variant_ids: [] },
    });
    expect(
      await setup({ planned: { ok: true, value: shotPlan } }).quotes.quote_generation(shotRequest),
    ).toMatchObject({ ok: true, value: { model_id: "flux-dev-fal" } });
    expect(
      await setup({
        planned: { ok: true, value: shotPlan },
        granted: budget({ allowed_models: ["nano-banana-2"] }),
      }).quotes.quote_generation(shotRequest),
    ).toMatchObject({ ok: false, error: { code: "MODEL_NOT_ALLOWED" } });
    expect(
      await setup({
        planned: { ok: true, value: { ...shotPlan, inputs: { prompt: "Sock enters", reference_variant_ids: [], source_take_id: "t1" } } },
      }).quotes.quote_generation({ ...shotRequest, operation: "edit", source_take_id: "t2" }),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("checks a shot's resolved model against the allowlist before asking for a price", async () => {
    const resolve = vi.fn(async () => ({
      ok: true as const,
      value: {
        model_id: "flux-dev-fal",
        provider: "fal",
        cost_request: { kind: "image" as const, count: 1 },
        subject: { project_id: "film", subject_id: "shot-1" },
        inputs: { prompt: "Sock enters", reference_variant_ids: [] },
      },
    }));
    const planner = vi.fn();
    const quotes = createAgentQuotes({
      plan: planner,
      resolve,
      budget: async () => ({ ok: true, value: budget({ allowed_models: ["nano-banana-2"] }) }),
    });
    expect(
      await quotes.quote_generation({ target: "shot_start_frame", operation: "generate", shot_id: "shot-1", prompt: "Sock enters" }),
    ).toMatchObject({ ok: false, error: { code: "MODEL_NOT_ALLOWED" } });
    expect(planner).not.toHaveBeenCalled();
  });
  it("quotes a shot video as video for that shot", async () => {
    const videoRequest = { target: "shot_video", operation: "generate", shot_id: "shot-1" };
    const settings = { duration: "8", resolution: "720p" };
    const videoPlan = plan({
      cost_request: { kind: "video", duration: "8", resolution: "720p", mode: "image-to-video", has_end_frame: false },
      subject: { project_id: "film", subject_id: "shot-1" },
      inputs: { prompt: "", reference_variant_ids: [], video: { mode: "image-to-video", settings, uses_end_frame: false, start_take_id: "t" } },
    });
    expect(
      await setup({ planned: { ok: true, value: videoPlan } }).quotes.quote_generation(videoRequest),
    ).toMatchObject({ ok: true, value: { kind: "video" } });
    expect(
      await setup({ planned: { ok: true, value: { ...videoPlan, cost_request: { kind: "image", count: 1 } } } }).quotes.quote_generation(videoRequest),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });

  it("refuses a retake whose resolved prompt is empty", async () => {
    const retake = { target: "bible_asset", operation: "retake", asset_id: "asset-1", model_id: "flux-dev-fal" };
    expect(
      await setup({ planned: { ok: true, value: plan({ inputs: { prompt: "", reference_variant_ids: [] } }) } }).quotes.quote_generation(retake),
    ).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
  });
});

function estimateOf(value: AgentQuotePlan) {
  if (value.estimate.kind !== "estimate") throw new Error("expected estimate");
  return value.estimate;
}
