import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import {
  agentFailure,
  agentQuotePlanSchema,
  agentQuoteRequestSchema,
  agentQuoteTargetSchema,
  type AgentQuote,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentQuoteTarget,
  type AgentResult,
} from "../../shared/agent-generation";
import { formatMicrousd } from "../../shared/money";
import { imageGenerationKind } from "../../shared/generation-cost";

const QUOTE_TTL_MS = 10 * 60 * 1000;

export interface StoredQuote {
  quote_id: string;
  request: AgentQuoteRequest;
  plan: AgentQuotePlan;
  grant_id: string;
  max_microusd: number;
  fingerprint: string;
  expires_at: number;
}

/** Fingerprints what a quote priced, so a later submit can detect drift. */
export function quoteFingerprint(
  request: AgentQuoteRequest,
  plan: Pick<AgentQuoteTarget, "model_id" | "cost_request" | "subject" | "inputs">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request,
        plan.model_id,
        plan.cost_request,
        plan.subject,
        plan.inputs,
      ]),
    )
    .digest("hex");
}

const inconsistent = () =>
  agentFailure("IO_ERROR", "Showbiz returned an inconsistent price plan.");
function matchesRequest(request: AgentQuoteRequest, target: AgentQuoteTarget) {
  const { kind } = target.cost_request;
  const { inputs } = target;
  const composes = inputs.reference_variant_ids.length > 0;
  const edit = request.operation === "edit";
  const operationFits =
    kind === imageGenerationKind({ edit, composes }) &&
    (request.operation !== "generate" || !composes) &&
    (!edit || (!composes && inputs.source_variant_id === request.source_variant_id));
  return (
    operationFits &&
    target.model_id === request.model_id &&
    target.subject.subject_id === request.asset_id &&
    (request.prompt === undefined || inputs.prompt === request.prompt)
  );
}

export function readTarget(
  request: AgentQuoteRequest,
  answer: unknown,
): AgentResult<AgentQuoteTarget> {
  const parsed = z.object(agentQuoteTargetSchema.shape).safeParse(answer);
  return parsed.success && matchesRequest(request, parsed.data)
    ? { ok: true, value: parsed.data }
    : inconsistent();
}

export function readPlan(
  request: AgentQuoteRequest,
  answer: unknown,
): AgentResult<AgentQuotePlan> {
  const parsed = agentQuotePlanSchema.safeParse(answer);
  if (
    !parsed.success ||
    !matchesRequest(request, parsed.data) ||
    (parsed.data.estimate.kind === "estimate" &&
      (parsed.data.estimate.price.model_id !== parsed.data.model_id ||
        parsed.data.estimate.price.provider !== parsed.data.provider))
  )
    return inconsistent();
  return { ok: true, value: parsed.data };
}

export function withinBudget(
  budget: AgentBudgetResult<AgentBudget>,
  modelId: string,
  maxMicrousd: number | null,
): AgentResult<AgentBudget> {
  if (!budget.ok) return budget;
  const { grant, remaining_microusd } = budget.value;
  if (budget.value.frozen)
    return agentFailure(
      "NO_BUDGET",
      "A charge exceeded its quote, so the agent budget is frozen. Grant a new budget in Showbiz to continue.",
    );
  if (grant.allowed_models && !grant.allowed_models.includes(modelId))
    return agentFailure(
      "MODEL_NOT_ALLOWED",
      `The agent budget does not allow ${modelId}. Allowed models: ${grant.allowed_models.join(", ")}.`,
    );
  if (maxMicrousd !== null && maxMicrousd > grant.per_request_cap_microusd)
    return agentFailure(
      "OVER_REQUEST_CAP",
      `Up to ${formatMicrousd(maxMicrousd)} exceeds the ${formatMicrousd(grant.per_request_cap_microusd)} per-request limit.`,
    );
  if (maxMicrousd !== null && maxMicrousd > remaining_microusd)
    return agentFailure(
      "OVER_BUDGET",
      `Up to ${formatMicrousd(maxMicrousd)} exceeds the ${formatMicrousd(remaining_microusd)} left in the agent budget.`,
    );
  return budget;
}

export function createAgentQuotes(options: {
  plan: (request: AgentQuoteRequest) => Promise<AgentResult<unknown>>;
  budget: () => Promise<AgentBudgetResult<AgentBudget>>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const quotes = new Map<string, StoredQuote>();
  function prune() {
    for (const [id, quote] of quotes)
      if (quote.expires_at <= now()) quotes.delete(id);
  }
  return {
    async quote_generation(
      args?: Record<string, unknown>,
    ): Promise<AgentResult<AgentQuote>> {
      const parsed = agentQuoteRequestSchema.safeParse(args ?? {});
      if (!parsed.success)
        return agentFailure(
          "INVALID_INPUT",
          parsed.error.issues[0]?.message ?? "Invalid quote request.",
        );
      const request = parsed.data;
      const early = withinBudget(await options.budget(), request.model_id, null);
      if (!early.ok) return early;
      const answer = await options.plan(request);
      if (!answer.ok) return answer;
      const planned = readPlan(request, answer.value);
      if (!planned.ok) return planned;
      const { estimate } = planned.value;
      if (estimate.kind !== "estimate")
        return agentFailure(
          "PRICE_UNKNOWN",
          `${estimate.reason} Paid generation needs a known price.`,
        );
      // Pricing can take a while, so the grant is read again before it is quoted against.
      const budget = withinBudget(
        await options.budget(),
        request.model_id,
        estimate.max_microusd,
      );
      if (!budget.ok) return budget;
      prune();
      const quote: StoredQuote = {
        quote_id: randomUUID(),
        request,
        plan: planned.value,
        grant_id: budget.value.grant.id,
        max_microusd: estimate.max_microusd,
        fingerprint: quoteFingerprint(request, planned.value),
        expires_at: now() + QUOTE_TTL_MS,
      };
      quotes.set(quote.quote_id, quote);
      return {
        ok: true,
        value: {
          quote_id: quote.quote_id,
          expires_at: new Date(quote.expires_at).toISOString(),
          model_id: planned.value.model_id,
          provider: planned.value.provider,
          kind: planned.value.cost_request.kind,
          min_microusd: estimate.min_microusd,
          max_microusd: estimate.max_microusd,
          price_source: estimate.price.source_url,
          price_checked_at: estimate.price.checked_at,
          price_freshness: estimate.price_freshness ?? null,
          price_stale: estimate.stale,
          price_basis: estimate.price,
          excludes_input_cost: estimate.excludes_input_cost,
          fingerprint: quote.fingerprint,
          budget_remaining_microusd: budget.value.remaining_microusd,
        },
      };
    },
    /** Removes the quote so it can back at most one submission. */
    take(quoteId: string): AgentResult<StoredQuote> {
      const quote = quotes.get(quoteId);
      if (!quote)
        return agentFailure(
          "QUOTE_NOT_FOUND",
          "This quote is unknown or was already used. Request a new quote.",
        );
      quotes.delete(quoteId);
      if (quote.expires_at <= now())
        return agentFailure("QUOTE_EXPIRED", "This quote expired. Request a new quote.");
      return { ok: true, value: quote };
    },
  };
}
