import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import {
  agentFailure,
  type AgentJob,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentResult,
} from "../../shared/agent-generation";
import type { createAgentJobLedger } from "./job-ledger";
import {
  quoteFingerprint,
  readPlan,
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
  result: z.strictObject({ variant_id: id.optional() }).optional(),
  error: z.string().max(2000).optional(),
  warnings: z.array(z.string().max(2000)).max(20).optional(),
});

export interface AgentJobStart {
  job_id: string;
  usage_request_id: string;
  request: AgentQuoteRequest;
  plan: AgentQuotePlan;
}

type Usage = { reported_microusd: number | null } | null;

export function createAgentJobs(options: {
  ledger: ReturnType<typeof createAgentJobLedger>;
  quotes: Pick<ReturnType<typeof createAgentQuotes>, "take">;
  budget: () => Promise<AgentBudgetResult<AgentBudget>>;
  resolve: (request: AgentQuoteRequest) => Promise<AgentResult<unknown>>;
  start: (job: AgentJobStart) => Promise<AgentResult<unknown>>;
  /** Reads the job's usage record in the open project, or null when none was started. */
  usage: (job: AgentJob) => Promise<Usage>;
  canEdit: () => boolean;
}) {
  const { ledger } = options;
  const limitReached = () =>
    ledger.unfinished() >= MAX_UNFINISHED_JOBS
      ? agentFailure(
          "JOB_LIMIT",
          "An agent generation is already running. Wait for it with get_generation_job before submitting another.",
        )
      : null;
  async function confirmCharge(job: AgentJob): Promise<AgentJob> {
    if (job.reported_microusd !== null || job.provider_called === false) return job;
    const usage = await options.usage(job);
    return usage?.reported_microusd != null
      ? (ledger.update(job.job_id, { reported_microusd: usage.reported_microusd }) ?? job)
      : job;
  }
  return {
    async submit_generation(
      args?: Record<string, unknown>,
    ): Promise<AgentResult<AgentJob>> {
      const input = submitSchema.safeParse(args ?? {});
      if (!input.success)
        return agentFailure("INVALID_INPUT", "Pass a quote_id and a request_id.");
      const existing = ledger.find(input.data.request_id);
      if (existing)
        return existing.quote_id === input.data.quote_id
          ? { ok: true, value: existing }
          : agentFailure(
              "INVALID_INPUT",
              "This request ID was already used with a different quote.",
            );
      if (!options.canEdit())
        return agentFailure(
          "BUSY",
          "Finish or discard unsaved edits in Showbiz before generating.",
        );
      const early = limitReached();
      if (early) return early;
      const quote = options.quotes.take(input.data.quote_id);
      if (!quote.ok) return quote;
      const resolved = await options.resolve(quote.value.request);
      if (!resolved.ok) return resolved;
      const plan = readPlan(quote.value.request, resolved.value);
      if (!plan.ok) return plan;
      if (quoteFingerprint(quote.value.request, plan.value) !== quote.value.fingerprint)
        return agentFailure(
          "QUOTE_STALE",
          "What was quoted has changed. Request a new quote.",
        );
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
      const late = limitReached();
      if (late) return late;
      const job = ledger.insert({
        job_id: randomUUID(),
        request_id: input.data.request_id,
        quote_id: quote.value.quote_id,
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
        return {
          ok: true,
          value:
            ledger.update(job.job_id, {
              status: "failed",
              provider_called: false,
              error: started.error.message,
            }) ?? job,
        };
      return { ok: true, value: ledger.get(job.job_id) ?? job };
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
      return {
        ok: true,
        value: ledger.list(input.data.project_id, input.data.offset, input.data.limit),
      };
    },
    async report(update: unknown): Promise<void> {
      const input = reportSchema.safeParse(update);
      if (!input.success) return;
      const job = ledger.get(input.data.job_id);
      if (!job) return;
      const { job_id, status, ...details } = input.data;
      const provider_called =
        status === "completed"
          ? true
          : status === "failed"
            ? (await options.usage(job)) !== null
            : job.provider_called;
      const updated = ledger.update(job_id, { status, provider_called, ...details });
      if (updated && status === "completed") await confirmCharge(updated);
    },
  };
}
