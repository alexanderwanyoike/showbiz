import { describe, expect, it, vi } from "vitest";
import { openTestDb } from "../db.test";
import type { AgentQuotePlan } from "../../shared/agent-generation";
import { createAgentJobLedger } from "./job-ledger";
import { createAgentJobs } from "./jobs";

const plan: AgentQuotePlan = {
  model_id: "flux-dev-fal",
  provider: "fal",
  cost_request: { kind: "image", count: 1 },
  subject: { project_id: "film", subject_id: "asset-1" },
  inputs: { prompt: "A tired sock puppet detective", reference_variant_ids: [] },
  estimate: {
    kind: "estimate",
    min_microusd: 20_000,
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
const unpriced: AgentQuotePlan = {
  ...plan,
  estimate: { kind: "unavailable", reason: "FAL did not accept the key used for pricing." },
};
const request = {
  target: "bible_asset",
  operation: "generate",
  asset_id: "asset-1",
  prompt: "A tired sock puppet detective",
  model_id: "flux-dev-fal",
};
const generateArgs = (requestId: string, overrides: Record<string, unknown> = {}) => ({
  ...request,
  ...overrides,
  request_id: requestId,
});

function setup(options: { canEdit?: boolean | (() => boolean) } = {}) {
  const db = openTestDb();
  const planner = vi.fn(async () => ({ ok: true as const, value: plan as unknown }));
  const ledger = createAgentJobLedger(db);
  const start = vi.fn(async () => ({ ok: true as const, value: null }));
  const usage = vi.fn(async () => null as null | { reported_microusd: number | null });
  const jobs = createAgentJobs({
    ledger,
    plan: planner,
    start,
    usage,
    canEdit: () =>
      typeof options.canEdit === "function" ? options.canEdit() : (options.canEdit ?? true),
  });
  return { db, jobs, ledger, planner, start, usage };
}
function deferred() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
}

describe("generating without a budget or quote", () => {
  it("starts the job at once and returns the estimate", async () => {
    const { jobs, start } = setup();
    const job = await jobs.generate(generateArgs("r1"));
    expect(job).toMatchObject({
      ok: true,
      value: {
        status: "accepted",
        model_id: "flux-dev-fal",
        charge_status: "estimated",
        estimate: {
          min_microusd: 20_000,
          max_microusd: 25_000,
          price_source: "https://fal.ai/docs",
          price_checked_at: "2026-11-08T09:59:00.000Z",
          price_stale: false,
          excludes_input_cost: false,
        },
      },
    });
    expect(start).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        job_id: job.ok ? job.value.job_id : "",
        usage_request_id: job.ok ? job.value.usage_request_id : "",
        request,
        plan,
      }),
    );
  });

  it("never lets an unknown price block generation", async () => {
    const { jobs, planner, start } = setup();
    planner.mockResolvedValueOnce({ ok: true, value: unpriced });
    expect(await jobs.generate(generateArgs("r1"))).toMatchObject({
      ok: true,
      value: { status: "accepted", estimate: null, charge_status: "unknown" },
    });
    expect(start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ plan: unpriced }));
  });

  it("refuses malformed requests and a plan that does not match the request", async () => {
    const { jobs, planner, start } = setup();
    expect(await jobs.generate({ ...request })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await jobs.generate(generateArgs("r1", { target: "timeline" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    planner.mockResolvedValueOnce({ ok: true, value: { ...plan, model_id: "another-model" } });
    expect(await jobs.generate(generateArgs("r2"))).toMatchObject({ ok: false, error: { code: "IO_ERROR" } });
    planner.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "Missing entry" } } as never);
    expect(await jobs.generate(generateArgs("r3"))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(start).not.toHaveBeenCalled();
  });

  it("allows only one unfinished job at a time and refuses during unsaved work", async () => {
    const { jobs } = setup();
    await jobs.generate(generateArgs("r1"));
    expect(await jobs.generate(generateArgs("r2"))).toMatchObject({ ok: false, error: { code: "JOB_LIMIT" } });
    const busy = setup({ canEdit: false });
    expect(await busy.jobs.generate(generateArgs("r1"))).toMatchObject({ ok: false, error: { code: "BUSY" } });
    expect(busy.start).not.toHaveBeenCalled();
  });

  it("checks for unsaved edits again after planning, before recording the job", async () => {
    let editable = true;
    const { jobs, planner, start, ledger } = setup({ canEdit: () => editable });
    planner.mockImplementationOnce(async () => {
      editable = false;
      return { ok: true, value: plan };
    });
    expect(await jobs.generate(generateArgs("r1"))).toMatchObject({ ok: false, error: { code: "BUSY" } });
    expect(start).not.toHaveBeenCalled();
    expect(ledger.find("r1")).toBeNull();
  });
});

describe("paying at most once per request ID", () => {
  it("returns the same job for a retried request ID and never starts it twice", async () => {
    const { jobs, start, planner } = setup();
    const first = await jobs.generate(generateArgs("r1"));
    const retry = await jobs.generate(generateArgs("r1"));
    expect(retry).toEqual(first);
    expect(start).toHaveBeenCalledTimes(1);
    expect(planner).toHaveBeenCalledTimes(1);
  });

  it("refuses a request ID reused with different arguments", async () => {
    const { jobs, start } = setup();
    await jobs.generate(generateArgs("r1"));
    expect(await jobs.generate(generateArgs("r1", { prompt: "A different sock" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("finds its job again after the app restarts, even while the UI has unsaved work", async () => {
    const { db, jobs, start } = setup();
    const first = await jobs.generate(generateArgs("r1"));
    const restarted = createAgentJobLedger(db);
    restarted.recoverInterrupted();
    const after = createAgentJobs({
      ledger: restarted,
      plan: vi.fn(),
      start,
      usage: async () => null,
      canEdit: () => false,
    });
    expect(await after.generate(generateArgs("r1"))).toMatchObject({
      ok: true,
      value: { job_id: first.ok ? first.value.job_id : "", status: "interrupted" },
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("returns the same job to a retry that arrives while the first request is still planning", async () => {
    const { jobs, planner, start } = setup();
    const slow = deferred();
    planner.mockImplementationOnce(async () => {
      await slow.gate;
      return { ok: true, value: plan };
    });
    const first = jobs.generate(generateArgs("r1"));
    const retry = jobs.generate(generateArgs("r1"));
    slow.release();
    const [a, b] = await Promise.all([first, retry]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("lets only one of two simultaneous requests through", async () => {
    const { jobs, start } = setup();
    const results = await Promise.all([jobs.generate(generateArgs("r1")), jobs.generate(generateArgs("r2"))]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ error: { code: "JOB_LIMIT" } });
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("agent job progress and charges", () => {
  it("marks a job failed when the window cannot start it", async () => {
    const { jobs, start } = setup();
    start.mockResolvedValueOnce({ ok: false, error: { code: "UNAVAILABLE", message: "No window" } } as never);
    expect(await jobs.generate(generateArgs("r1"))).toMatchObject({
      ok: true,
      value: { status: "failed", provider_called: false, error: "No window", charge_status: "released" },
    });
  });

  it("frees the slot but keeps the outcome open when the window did not answer a start in time", async () => {
    const { jobs, start } = setup();
    start.mockResolvedValueOnce({
      ok: false,
      error: { code: "NO_ANSWER", message: "Showbiz did not answer in time." },
    } as never);
    expect(await jobs.generate(generateArgs("r1"))).toMatchObject({
      ok: true,
      value: { status: "interrupted", provider_called: null, charge_status: "estimated" },
    });
    expect(await jobs.generate(generateArgs("r2"))).toMatchObject({ ok: true, value: { status: "accepted" } });
  });

  it("records progress reported by the window and the confirmed charge from the usage record", async () => {
    const { jobs, usage } = setup();
    const submitted = await jobs.generate(generateArgs("r1"));
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
      value: { reported_microusd: 21_000, charge_status: "confirmed" },
    });
  });

  it("knows a failed job cost nothing only when no usage record was started", async () => {
    const { jobs, usage, ledger } = setup();
    const failed = await jobs.generate(generateArgs("r1"));
    if (!failed.ok) throw new Error("expected job");
    usage.mockResolvedValue(null);
    await jobs.report({ job_id: failed.value.job_id, status: "failed", error: "No FAL key" });
    expect(await jobs.get_generation_job({ job_id: failed.value.job_id })).toMatchObject({
      ok: true,
      value: { status: "failed", provider_called: false, charge_status: "released" },
    });
    const unchecked = await jobs.generate(generateArgs("r2"));
    if (!unchecked.ok) throw new Error("expected job");
    usage.mockRejectedValue(new Error("Project storage failed"));
    await jobs.report({ job_id: unchecked.value.job_id, status: "failed", error: "Closed" });
    expect(ledger.get(unchecked.value.job_id)).toMatchObject({
      status: "failed",
      provider_called: null,
      charge_status: "estimated",
    });
  });

  it("ignores reports for finished jobs, but accepts the outcome of an interrupted one", async () => {
    const { jobs, ledger } = setup();
    const first = await jobs.generate(generateArgs("r1"));
    if (!first.ok) throw new Error("expected job");
    const id = first.value.job_id;
    await jobs.report({ job_id: id, status: "failed", error: "Provider error" });
    await jobs.report({ job_id: id, status: "running" });
    expect(ledger.get(id)?.status).toBe("failed");
    ledger.update(id, { status: "interrupted" });
    await jobs.report({ job_id: id, status: "running" });
    expect(ledger.get(id)?.status).toBe("interrupted");
    await jobs.report({ job_id: id, status: "completed", result: { variant_id: "v1" }, warnings: [] });
    expect(ledger.get(id)).toMatchObject({ status: "completed", provider_called: true });
  });

  it("interrupts unfinished jobs when the app window goes away", async () => {
    const { jobs, ledger } = setup();
    const first = await jobs.generate(generateArgs("r1"));
    if (!first.ok) throw new Error("expected job");
    jobs.interruptUnfinished();
    expect(ledger.get(first.value.job_id)?.status).toBe("interrupted");
  });

  it("ignores progress for unknown jobs and lists a project's jobs with confirmed charges", async () => {
    const { jobs, ledger, usage } = setup();
    await jobs.report({ job_id: "nope", status: "completed" });
    const first = await jobs.generate(generateArgs("r1"));
    if (!first.ok) throw new Error("expected job");
    ledger.update(first.value.job_id, { status: "completed", provider_called: true });
    usage.mockResolvedValue({ reported_microusd: 20_000 });
    expect(await jobs.list_generation_jobs({ project_id: "film", offset: 0, limit: 10 })).toMatchObject({
      ok: true,
      value: [{ request_id: "r1", reported_microusd: 20_000, charge_status: "confirmed" }],
    });
    expect(await jobs.get_generation_job({ job_id: "nope" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
