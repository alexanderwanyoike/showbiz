import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import {
  agentFailure,
  agentJobResultSchema,
  type AgentJob,
  type AgentJobStart,
  type AgentQuoteRequest,
  type AgentResult,
} from "../../shared/agent-generation";
import type { createAgentJobLedger } from "./job-ledger";
import {
  quoteFingerprint,
  readTarget,
  withinBudget,
  type createAgentQuotes,
} from "./quotes";

const MAX_UNFINISHED_JOBS = 1;
const id = z.string().min(1).max(200);
const submitSchema = z.strictObject({ quote_id: id, request_id: id });
const jobIdSchema = z.strictObject({ job_id: id });
const listSchema = z.strictObject({
  project_id: id,
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(50),
});
const reportSchema = z.strictObject({
  job_id: id,
  status: z.enum(["running", "completed", "failed"]),
  result: agentJobResultSchema.optional(),
  error: z.string().max(2000).optional(),
  warnings: z.array(z.string().max(2000)).max(20).optional(),
});

type Usage = { reported_microusd: number | null } | null | undefined;
const providerCalled = (usage: Usage): boolean | null =>
  usage === undefined ? null : usage !== null;

export function createAgentJobs(options: {
  ledger: ReturnType<typeof createAgentJobLedger>;
  quotes: Pick<ReturnType<typeof createAgentQuotes>, "take">;
  budget: () => Promise<AgentBudgetResult<AgentBudget>>;
  resolve: (request: AgentQuoteRequest) => Promise<AgentResult<unknown>>;
  start: (job: AgentJobStart) => Promise<AgentResult<unknown>>;
  /** null when no usage record was started; undefined when that cannot be known. */
  usage: (job: AgentJob) => Promise<Usage>;
  canEdit: () => boolean;
}) {
  const { ledger } = options;
  // A retry can arrive while the first submit is still checking, before its ledger row exists.
  const inFlight = new Map<
    string,
    { quote_id: string; result: Promise<AgentResult<AgentJob>> }
  >();
  const limitReached = () =>
    ledger.unfinished() >= MAX_UNFINISHED_JOBS
      ? agentFailure(
          "JOB_LIMIT",
          "An agent generation is already running. Wait for it with get_generation_job before submitting another.",
        )
      : null;
  const editBlocked = () =>
    options.canEdit()
      ? null
      : agentFailure(
          "BUSY",
          "Finish or discard unsaved edits in Showbiz before generating.",
        );
  // A failed lookup means the outcome is unknown, so any hold is kept.
  async function readUsage(job: AgentJob): Promise<Usage> {
    try {
      return await options.usage(job);
    } catch (cause) {
      console.warn(`Could not read the usage record of agent job ${job.job_id}:`, cause);
      return undefined;
    }
  }
  async function confirmCharge(job: AgentJob): Promise<AgentJob> {
    if (job.reported_microusd !== null || job.provider_called === false) return job;
    const usage = await readUsage(job);
    return usage?.reported_microusd != null
      ? (ledger.update(job.job_id, { reported_microusd: usage.reported_microusd }) ?? job)
      : job;
  }
  async function settle(): Promise<void> {
    for (const job of ledger.unsettled()) await confirmCharge(job);
  }
  async function submit(
    request_id: string,
    quote_id: string,
  ): Promise<AgentResult<AgentJob>> {
    const early = limitReached() ?? editBlocked();
    if (early) return early;
    const quote = options.quotes.take(quote_id);
    if (!quote.ok) return quote;
    const resolved = await options.resolve(quote.value.request);
    if (!resolved.ok) return resolved;
    const target = readTarget(quote.value.request, resolved.value);
    if (!target.ok) return target;
    if (quoteFingerprint(quote.value.request, target.value) !== quote.value.fingerprint)
      return agentFailure("QUOTE_STALE", "What was quoted has changed. Request a new quote.");
    await settle();
    const budget = withinBudget(
      await options.budget(),
      quote.value.plan.model_id,
      quote.value.max_microusd,
    );
    if (!budget.ok) return budget;
    if (budget.value.grant.id !== quote.value.grant_id)
      return agentFailure(
        "NO_BUDGET",
        "The agent budget changed after this quote. Request a new quote.",
      );
    // No awaits from here until the insert, so the checks and the hold cannot interleave with another submit.
    const late = limitReached() ?? editBlocked();
    if (late) return late;
    const job = ledger.insert({
      job_id: randomUUID(),
      request_id,
      quote_id,
      grant_id: quote.value.grant_id,
      project_id: quote.value.plan.subject.project_id,
      subject_id: quote.value.plan.subject.subject_id,
      usage_request_id: randomUUID(),
      model_id: quote.value.plan.model_id,
      kind: quote.value.plan.cost_request.kind,
      reserved_microusd: quote.value.max_microusd,
    });
    const started = await options.start({
      job_id: job.job_id,
      usage_request_id: job.usage_request_id,
      request: quote.value.request,
      plan: quote.value.plan,
    });
    if (!started.ok)
      ledger.update(
        job.job_id,
        // Without an answer the window may still be generating, so the hold stays; a late report can still finish the job.
        started.error.code === "NO_ANSWER"
          ? { status: "interrupted", error: started.error.message }
          : { status: "failed", provider_called: false, error: started.error.message },
      );
    return { ok: true, value: ledger.get(job.job_id) ?? job };
  }
  return {
    settle,
    async submit_generation(
      args?: Record<string, unknown>,
    ): Promise<AgentResult<AgentJob>> {
      const input = submitSchema.safeParse(args ?? {});
      if (!input.success)
        return agentFailure("INVALID_INPUT", "Pass a quote_id and a request_id.");
      const { request_id, quote_id } = input.data;
      const reused = agentFailure(
        "INVALID_INPUT",
        "This request ID was already used with a different quote.",
      );
      const existing = ledger.find(request_id);
      if (existing)
        return existing.quote_id === quote_id ? { ok: true, value: existing } : reused;
      const pending = inFlight.get(request_id);
      if (pending) return pending.quote_id === quote_id ? pending.result : reused;
      const result = submit(request_id, quote_id);
      inFlight.set(request_id, { quote_id, result });
      try {
        return await result;
      } finally {
        inFlight.delete(request_id);
      }
    },
    async get_generation_job(
      args?: Record<string, unknown>,
    ): Promise<AgentResult<AgentJob>> {
      const input = jobIdSchema.safeParse(args ?? {});
      if (!input.success) return agentFailure("INVALID_INPUT", "Pass a job_id.");
      const job = ledger.get(input.data.job_id);
      if (!job) return agentFailure("NOT_FOUND", "No agent job has that ID.");
      return { ok: true, value: await confirmCharge(job) };
    },
    async list_generation_jobs(
      args?: Record<string, unknown>,
    ): Promise<AgentResult<AgentJob[]>> {
      const input = listSchema.safeParse(args ?? {});
      if (!input.success) return agentFailure("INVALID_INPUT", "Pass a project_id.");
      const listed = ledger.list(input.data.project_id, input.data.offset, input.data.limit);
      const confirmed: AgentJob[] = [];
      for (const job of listed) confirmed.push(await confirmCharge(job));
      return { ok: true, value: confirmed };
    },
    /** Jobs the window can no longer finish keep their holds until a charge is confirmed. */
    interruptUnfinished(): void {
      ledger.recoverInterrupted();
    },
    async report(update: unknown): Promise<void> {
      const input = reportSchema.safeParse(update);
      if (!input.success) {
        console.warn("Ignored a malformed agent job report:", input.error.message);
        return;
      }
      const job = ledger.get(input.data.job_id);
      const { job_id, status, ...details } = input.data;
      // Finished jobs never change; an interrupted job may still learn its real outcome.
      if (
        !job ||
        job.status === "completed" ||
        job.status === "failed" ||
        (job.status === "interrupted" && status === "running")
      ) {
        console.warn(`Ignored a ${status} report for agent job ${job_id}.`);
        return;
      }
      const provider_called =
        status === "completed"
          ? true
          : status === "failed"
            ? providerCalled(await readUsage(job))
            : job.provider_called;
      const updated = ledger.update(job_id, { status, provider_called, ...details });
      if (updated && status === "completed") await confirmCharge(updated);
    },
  };
}
