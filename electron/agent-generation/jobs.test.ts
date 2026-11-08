import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { openTestDb } from "../db.test";
import { createAgentBudgetCommands } from "../commands/agent-budget";
import { createGenerationModelCommands } from "../commands/generation-models";
import type { AgentQuotePlan } from "../../shared/agent-generation";
import { createAgentQuotes } from "./quotes";
import { createAgentJobLedger } from "./job-ledger";
import { createAgentJobs } from "./jobs";

const catalog = createGenerationModelCommands(path.resolve("src/lib/models/providers"));
const plan: AgentQuotePlan = {
  model_id: "flux-dev-fal",
  provider: "fal",
  cost_request: { kind: "image", count: 1 },
  subject: { project_id: "film", subject_id: "asset-1" },
  estimate: {
    kind: "estimate",
    min_microusd: 25_000,
    max_microusd: 25_000,
    price: {
      provider: "fal",
      model_id: "flux-dev-fal",
      currency: "USD",
      source_kind: "provider",
      source_url: "https://fal.ai/docs",
      checked_at: "2026-11-08T09:59:00.000Z",
      endpoint_id: "fal-ai/flux/dev",
      estimate_basis: "historical_request",
      rates: [{ unit: "request", microusd: 25_000 }],
    },
    stale: false,
    excludes_input_cost: false,
  },
};
const quoteRequest = {
  target: "bible_asset",
  operation: "generate",
  asset_id: "asset-1",
  prompt: "A tired sock puppet detective",
  model_id: "flux-dev-fal",
};

function setup(options: { cap?: number; max?: number; canEdit?: boolean } = {}) {
  const db = openTestDb();
  let now = Date.parse("2026-11-08T10:00:00.000Z");
  const budget = createAgentBudgetCommands(db, {
    readModels: catalog.get_generation_models,
    now: () => now,
  });
  budget.grant_agent_budget({
    max_microusd: options.max ?? 100_000,
    per_request_cap_microusd: options.cap,
    duration_minutes: 60,
  });
  const resolve = vi.fn(async () => ({ ok: true as const, value: plan }));
  const quotes = createAgentQuotes({
    plan: resolve,
    budget: async () => budget.get_agent_budget(),
    now: () => now,
  });
  const ledger = createAgentJobLedger(db, () => now);
  const start = vi.fn(async () => ({ ok: true as const, value: null }));
  const usage = vi.fn(async () => null as null | { reported_microusd: number | null });
  const jobs = createAgentJobs({
    ledger,
    quotes,
    budget: async () => budget.get_agent_budget(),
    resolve,
    start,
    usage,
    canEdit: () => options.canEdit ?? true,
  });
  const quote = async () => {
    const quoted = await quotes.quote_generation(quoteRequest);
    if (!quoted.ok) throw new Error(quoted.error.message);
    return quoted.value.quote_id;
  };
  return { db, jobs, ledger, quote, start, resolve, usage, budget, advance: (ms: number) => (now += ms) };
}

describe("agent jobs", () => {
  it("holds the quoted amount and hands the job to the app window", async () => {
    const { jobs, quote, start, budget } = setup();
    const submitted = await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" });
    expect(submitted).toMatchObject({
      ok: true,
      value: { status: "accepted", reserved_microusd: 25_000, model_id: "flux-dev-fal" },
    });
    expect(start).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        job_id: submitted.ok ? submitted.value.job_id : "",
        usage_request_id: submitted.ok ? submitted.value.usage_request_id : "",
        request: quoteRequest,
        plan,
      }),
    );
    expect(budget.get_agent_budget()).toMatchObject({
      ok: true,
      value: { remaining_microusd: 75_000 },
    });
  });

  it("returns the same job for a retried request ID and never starts it twice", async () => {
    const { jobs, quote, start } = setup();
    const quoteId = await quote();
    const first = await jobs.submit_generation({ quote_id: quoteId, request_id: "r1" });
    const retry = await jobs.submit_generation({ quote_id: quoteId, request_id: "r1" });
    expect(retry).toEqual(first);
    expect(start).toHaveBeenCalledTimes(1);
    expect(
      await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("finds its job again after the app restarts, even while the UI has unsaved work", async () => {
    const { db, jobs, quote, start } = setup();
    const quoteId = await quote();
    const first = await jobs.submit_generation({ quote_id: quoteId, request_id: "r1" });
    const restarted = createAgentJobLedger(db);
    restarted.recoverInterrupted();
    const after = createAgentJobs({
      ledger: restarted,
      quotes: createAgentQuotes({ plan: vi.fn(), budget: vi.fn() }),
      budget: vi.fn(),
      resolve: vi.fn(),
      start,
      usage: async () => null,
      canEdit: () => false,
    });
    expect(
      await after.submit_generation({ quote_id: quoteId, request_id: "r1" }),
    ).toMatchObject({
      ok: true,
      value: { job_id: first.ok ? first.value.job_id : "", status: "interrupted" },
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("allows only one unfinished paid job at a time", async () => {
    const { jobs, quote } = setup();
    await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" });
    expect(
      await jobs.submit_generation({ quote_id: await quote(), request_id: "r2" }),
    ).toMatchObject({ ok: false, error: { code: "JOB_LIMIT" } });
  });

  it("refuses while the UI has unsaved work", async () => {
    const { jobs, quote, start } = setup({ canEdit: false });
    expect(
      await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" }),
    ).toMatchObject({ ok: false, error: { code: "BUSY" } });
    expect(start).not.toHaveBeenCalled();
  });

  it("refuses expired, unknown and reused quotes", async () => {
    const { jobs, quote, advance } = setup();
    const quoteId = await quote();
    advance(10 * 60 * 1000);
    expect(
      await jobs.submit_generation({ quote_id: quoteId, request_id: "r1" }),
    ).toMatchObject({ ok: false, error: { code: "QUOTE_EXPIRED" } });
    expect(
      await jobs.submit_generation({ quote_id: "nope", request_id: "r2" }),
    ).toMatchObject({ ok: false, error: { code: "QUOTE_NOT_FOUND" } });
  });

  it("refuses when what was quoted has changed", async () => {
    const { jobs, quote, resolve, start } = setup();
    const quoteId = await quote();
    resolve.mockResolvedValueOnce({
      ok: true,
      value: { ...plan, subject: { project_id: "another-film", subject_id: "asset-1" } },
    });
    expect(
      await jobs.submit_generation({ quote_id: quoteId, request_id: "r1" }),
    ).toMatchObject({ ok: false, error: { code: "QUOTE_STALE" } });
    expect(start).not.toHaveBeenCalled();
  });

  it("refuses when the budget was revoked or used up after quoting", async () => {
    const { jobs, quote, budget, ledger } = setup({ max: 40_000 });
    const quoteId = await quote();
    budget.revoke_agent_budget();
    expect(
      await jobs.submit_generation({ quote_id: quoteId, request_id: "r1" }),
    ).toMatchObject({ ok: false, error: { code: "NO_BUDGET" } });
    const replaced = setup({ max: 40_000 });
    const second = await replaced.quote();
    const granted = replaced.budget.get_agent_budget();
    if (!granted.ok) throw new Error("expected budget");
    replaced.ledger.insert({
      job_id: "other", request_id: "other", quote_id: "q", grant_id: granted.value.grant.id,
      project_id: "film", subject_id: "s", usage_request_id: "u-other", model_id: "m",
      kind: "image", reserved_microusd: 20_000,
    });
    replaced.ledger.update("other", { status: "completed", provider_called: true });
    expect(
      await replaced.jobs.submit_generation({ quote_id: second, request_id: "r2" }),
    ).toMatchObject({ ok: false, error: { code: "OVER_BUDGET" } });
    expect(ledger.unfinished()).toBe(0);
  });

  it("marks a job failed and releases its hold when the window cannot start it", async () => {
    const { jobs, quote, start, budget } = setup();
    start.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNAVAILABLE", message: "No window" },
    } as never);
    const submitted = await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" });
    expect(submitted).toMatchObject({
      ok: true,
      value: { status: "failed", provider_called: false, error: "No window" },
    });
    expect(budget.get_agent_budget()).toMatchObject({ ok: true, value: { remaining_microusd: 100_000 } });
  });

  it("records progress reported by the window and the confirmed charge from the usage record", async () => {
    const { jobs, quote, usage, budget } = setup();
    const submitted = await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" });
    if (!submitted.ok) throw new Error("expected job");
    const id = submitted.value.job_id;
    await jobs.report({ job_id: id, status: "running" });
    usage.mockResolvedValue({ reported_microusd: null });
    await jobs.report({ job_id: id, status: "completed", result: { variant_id: "v1" }, warnings: [] });
    expect(await jobs.get_generation_job({ job_id: id })).toMatchObject({
      ok: true,
      value: { status: "completed", provider_called: true, result: { variant_id: "v1" }, reported_microusd: null },
    });
    usage.mockResolvedValue({ reported_microusd: 21_000 });
    expect(await jobs.get_generation_job({ job_id: id })).toMatchObject({
      ok: true,
      value: { reported_microusd: 21_000 },
    });
    expect(budget.get_agent_budget()).toMatchObject({ ok: true, value: { remaining_microusd: 79_000 } });
  });

  it("releases the hold of a failed job only when no usage record was started", async () => {
    const { jobs, quote, usage, budget } = setup();
    const submitted = await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" });
    if (!submitted.ok) throw new Error("expected job");
    usage.mockResolvedValue(null);
    await jobs.report({ job_id: submitted.value.job_id, status: "failed", error: "No FAL key" });
    expect(await jobs.get_generation_job({ job_id: submitted.value.job_id })).toMatchObject({
      ok: true,
      value: { status: "failed", provider_called: false },
    });
    expect(budget.get_agent_budget()).toMatchObject({ ok: true, value: { remaining_microusd: 100_000 } });
  });

  it("ignores progress for unknown jobs and lists a project's jobs", async () => {
    const { jobs, quote } = setup();
    await jobs.report({ job_id: "nope", status: "completed" });
    await jobs.submit_generation({ quote_id: await quote(), request_id: "r1" });
    expect(await jobs.list_generation_jobs({ project_id: "film", offset: 0, limit: 10 })).toMatchObject({
      ok: true,
      value: [{ request_id: "r1" }],
    });
    expect(await jobs.get_generation_job({ job_id: "nope" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
