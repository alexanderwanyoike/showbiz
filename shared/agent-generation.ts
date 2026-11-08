import { z } from "zod";
import { generationPriceSchema } from "./generation-price-schema";
import type {
  GenerationCostEstimate,
  GenerationCostRequest,
  GenerationPrice,
} from "./generation-cost";

export const AGENT_REQUEST_CHANNEL = "showbiz:agent_request";
export const AGENT_RESPONSE_CHANNEL = "showbiz:agent_response";

const id = z.string().min(1).max(200);
const prompt = z.string().trim().min(1).max(50000);

export const agentQuoteRequestSchema = z.discriminatedUnion("target", [
  z.strictObject({
    target: z.literal("bible_asset"),
    operation: z.literal("generate"),
    asset_id: id,
    prompt,
    model_id: id,
  }),
]);
export type AgentQuoteRequest = z.infer<typeof agentQuoteRequestSchema>;

/** What the renderer resolves for a request: the same model, settings and estimate the app would use. */
export interface AgentQuotePlan {
  model_id: string;
  provider: string;
  cost_request: GenerationCostRequest;
  subject: { project_id: string; subject_id: string };
  estimate: GenerationCostEstimate;
}

const microusd = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const agentQuotePlanSchema = z.strictObject({
  model_id: id,
  provider: id,
  cost_request: z
    .object({
      kind: z.enum(["image", "image_edit", "image_compose", "video"]),
    })
    .passthrough(),
  subject: z.strictObject({ project_id: id, subject_id: id }),
  estimate: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("unavailable"), reason: z.string() }),
    z
      .strictObject({
        kind: z.literal("estimate"),
        min_microusd: microusd,
        max_microusd: microusd,
        price: generationPriceSchema,
        stale: z.boolean(),
        price_freshness: z.enum(["live", "cached", "stale"]).optional(),
        excludes_input_cost: z.boolean(),
      })
      .refine((estimate) => estimate.min_microusd <= estimate.max_microusd),
  ]),
});

export interface AgentQuote {
  quote_id: string;
  expires_at: string;
  model_id: string;
  provider: string;
  kind: GenerationCostRequest["kind"];
  min_microusd: number;
  max_microusd: number;
  price_source: string;
  price_checked_at: string;
  price_freshness: "live" | "cached" | "stale" | null;
  price_stale: boolean;
  price_basis: GenerationPrice;
  excludes_input_cost: boolean;
  fingerprint: string;
  budget_remaining_microusd: number;
}

export const agentGenerationErrorCodes = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "UNAVAILABLE",
  "IO_ERROR",
  "NO_BUDGET",
  "MODEL_NOT_ALLOWED",
  "OVER_REQUEST_CAP",
  "OVER_BUDGET",
  "PRICE_UNKNOWN",
  "QUOTE_EXPIRED",
  "QUOTE_NOT_FOUND",
] as const;
export type AgentGenerationErrorCode = (typeof agentGenerationErrorCodes)[number];

export type AgentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AgentGenerationErrorCode; message: string } };

export const agentFailure = (
  code: AgentGenerationErrorCode,
  message: string,
): AgentResult<never> => ({ ok: false, error: { code, message } });

export interface AgentRequest {
  request_id: string;
  operation: string;
  input: unknown;
}
