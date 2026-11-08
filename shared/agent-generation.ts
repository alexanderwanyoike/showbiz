import { z } from "zod";
import type {
  GenerationCostEstimate,
  GenerationCostRequest,
} from "./generation-cost";

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
  excludes_input_cost: boolean;
  budget_remaining_microusd: number;
}

export type AgentGenerationErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "IO_ERROR"
  | "NO_BUDGET"
  | "MODEL_NOT_ALLOWED"
  | "OVER_REQUEST_CAP"
  | "OVER_BUDGET"
  | "PRICE_UNKNOWN"
  | "QUOTE_EXPIRED"
  | "QUOTE_NOT_FOUND";

export type AgentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AgentGenerationErrorCode; message: string } };

export interface AgentRequest {
  request_id: string;
  operation: string;
  input: unknown;
}
