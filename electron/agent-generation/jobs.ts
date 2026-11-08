import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentFailure,
  agentJobResultSchema,
  agentQuoteRequestSchema,
  type AgentJob,
  type AgentJobEstimate,
  type AgentJobStart,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentResult,
} from "../../shared/agent-generation";
import type { createAgentJobLedger } from "./job-ledger";
import { readPlan } from "./plan-check";

const MAX_UNFINISHED_JOBS = 1;
const id = z.string().min(1).max(200);
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
const fingerprint = (request: AgentQuoteRequest) =>
  createHash("sha256").update(JSON.stringify(request)).digest("hex");
const estimateOf = ({ estimate }: AgentQuotePlan): AgentJobEstimate | null =>
  estimate.kind === "estimate"
    ? {
        min_microusd: estimate.min_microusd,
        max_microusd: estimate.max_microusd,
        price_source: estimate.price.source_url,
        price_checked_at: estimate.price.checked_at,
        price_stale: estimate.stale,
        excludes_input_cost: estimate.excludes_input_cost,
      }
    : null;

function readGenerateArgs(
  args: Record<string, unknown> | undefined,
): AgentResult<{ request_id: string; request: AgentQuoteRequest }> {
  const { request_id, ...fields } = args ?? {};
  const requestId = id.safeParse(request_id);
  if (!requestId.success) return agentFailure("INVALID_INPUT", "Pass a request_id.");
  const request = agentQuoteRequestSchema.safeParse(fields);
  if (!request.success)
    return agentFailure(
      "INVALID_INPUT",
      request.error.issues[0]?.message ?? "Invalid generation request.",
    );
  return { ok: true, value: { request_id: requestId.data, request: request.data } };
}

export function createAgentJobs(options: {
  ledger: ReturnType<typeof createAgentJobLedger>;
  /** Asks the app window for the model, inputs and estimate its own controls would use. */
  plan: (request: AgentQuoteRequest) => Promise<AgentResult<unknown>>;
  start: (job: AgentJobStart) => Promise<AgentResult<unknown>>;
  /** null when no usage record was started; undefined when that cannot be known. */
  usage: (job: AgentJob) => Promise<Usage>;
  canEdit: () => boolean;
}) {
  const { ledger } = options;
  // A retry can arrive while the first request is still planning, before its ledger row exists.
  const inFlight = new Map<
    string,
    { fingerprint: string; result: Promise<AgentResult<AgentJob>> }
  >();
  const limitReached = () =>
    ledger.unfinished() >= MAX_UNFINISHED_JOBS
      ? agentFailure(
          "JOB_LIMIT",
          "An agent generation is already running. Wait for it with get_generation_job before starting another.",
        )
      : null;
  const editBlocked = () =>
    options.canEdit()
      ? null
      : agentFailure(
          "BUSY",
          "Finish or discard unsaved edits in Showbiz before generating.",
        );
  // A failed lookup means the outcome is unknown.
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
  async function start(
    request_id: string,
    request: AgentQuoteRequest,
    request_fingerprint: string,
  ): Promise<AgentResult<AgentJob>> {
    const early = limitReached() ?? editBlocked();
    if (early) return early;
    const answer = await options.plan(request);
    if (!answer.ok) return answer;
    const plan = readPlan(request, answer.value);
    if (!plan.ok) return plan;
    // No awaits from here until the insert, so the checks and the record cannot interleave with another request.
    const late = limitReached() ?? editBlocked();
    if (late) return late;
    const job = ledger.insert({
      job_id: randomUUID(),
      request_id,
      request_fingerprint,
      project_id: plan.value.subject.project_id,
      subject_id: plan.value.subject.subject_id,
      usage_request_id: randomUUID(),
      model_id: plan.value.model_id,
      kind: plan.value.cost_request.kind,
      estimate: estimateOf(plan.value),
    });
    const started = await options.start({
      job_id: job.job_id,
      usage_request_id: job.usage_request_id,
      request,
      plan: plan.value,
    });
    if (!started.ok)
      ledger.update(
        job.job_id,
        // Without an answer the window may still be generating; a late report can still finish the job.
        started.error.code === "NO_ANSWER"
          ? { status: "interrupted", error: started.error.message }
          : { status: "failed", provider_called: false, error: started.error.message },
      );
    return { ok: true, value: ledger.get(job.job_id) ?? job };
  }
  return {
    async generate(args?: Record<string, unknown>): Promise<AgentResult<AgentJob>> {
      const input = readGenerateArgs(args);
      if (!input.ok) return input;
      const { request_id, request } = input.value;
      const requestFingerprint = fingerprint(request);
      const reused = agentFailure(
        "INVALID_INPUT",
        "This request ID was already used with different arguments.",
      );
      const existing = ledger.find(request_id);
      if (existing)
        return existing.request_fingerprint === requestFingerprint
          ? { ok: true, value: existing }
          : reused;
      const pending = inFlight.get(request_id);
      if (pending) return pending.fingerprint === requestFingerprint ? pending.result : reused;
      const result = start(request_id, request, requestFingerprint);
      inFlight.set(request_id, { fingerprint: requestFingerprint, result });
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
