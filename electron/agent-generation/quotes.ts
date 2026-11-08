import { createHash, randomUUID } from "node:crypto";
import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import {
  agentQuoteRequestSchema,
  type AgentQuote,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentResult,
} from "../../shared/agent-generation";
import { formatMicrousd } from "../../shared/money";

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

const failure = (
  code: Extract<AgentResult<never>, { ok: false }>["error"]["code"],
  message: string,
): AgentResult<never> => ({ ok: false, error: { code, message } });

/** Fingerprints what a quote priced, so a later submit can detect drift. */
export function quoteFingerprint(
  request: AgentQuoteRequest,
  plan: Pick<AgentQuotePlan, "model_id" | "cost_request" | "subject">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request,
        plan.model_id,
        plan.cost_request,
        plan.subject,
      ]),
    )
    .digest("hex");
}

export function createAgentQuotes(options: {
  plan: (request: AgentQuoteRequest) => Promise<AgentResult<AgentQuotePlan>>;
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
        return failure(
          "INVALID_INPUT",
          parsed.error.issues[0]?.message ?? "Invalid quote request.",
        );
      const budget = await options.budget();
      if (!budget.ok) return budget;
      const { grant } = budget.value;
      if (grant.allowed_models && !grant.allowed_models.includes(parsed.data.model_id))
        return failure(
          "MODEL_NOT_ALLOWED",
          `The agent budget does not allow ${parsed.data.model_id}. Allowed models: ${grant.allowed_models.join(", ")}.`,
        );
      const planned = await options.plan(parsed.data);
      if (!planned.ok) return planned;
      const { estimate } = planned.value;
      if (estimate.kind !== "estimate")
        return failure(
          "PRICE_UNKNOWN",
          `${estimate.reason} Paid generation needs a known price.`,
        );
      if (grant.allowed_models && !grant.allowed_models.includes(planned.value.model_id))
        return failure(
          "MODEL_NOT_ALLOWED",
          `The agent budget does not allow ${planned.value.model_id}.`,
        );
      if (estimate.max_microusd > grant.per_request_cap_microusd)
        return failure(
          "OVER_REQUEST_CAP",
          `Up to ${formatMicrousd(estimate.max_microusd)} exceeds the ${formatMicrousd(grant.per_request_cap_microusd)} per-request limit.`,
        );
      if (estimate.max_microusd > budget.value.remaining_microusd)
        return failure(
          "OVER_BUDGET",
          `Up to ${formatMicrousd(estimate.max_microusd)} exceeds the ${formatMicrousd(budget.value.remaining_microusd)} left in the agent budget.`,
        );
      prune();
      const quote: StoredQuote = {
        quote_id: randomUUID(),
        request: parsed.data,
        plan: planned.value,
        grant_id: grant.id,
        max_microusd: estimate.max_microusd,
        fingerprint: quoteFingerprint(parsed.data, planned.value),
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
          excludes_input_cost: estimate.excludes_input_cost,
          budget_remaining_microusd: budget.value.remaining_microusd,
        },
      };
    },
    /** Removes the quote so it can back at most one submission. */
    take(quoteId: string): AgentResult<StoredQuote> {
      const quote = quotes.get(quoteId);
      if (!quote)
        return failure(
          "QUOTE_NOT_FOUND",
          "This quote is unknown or was already used. Request a new quote.",
        );
      quotes.delete(quoteId);
      if (quote.expires_at <= now())
        return failure("QUOTE_EXPIRED", "This quote expired. Request a new quote.");
      return { ok: true, value: quote };
    },
  };
}
