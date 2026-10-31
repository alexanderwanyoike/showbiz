import type { GenerationPrice } from "./generation-cost";

export const providerPrices: GenerationPrice[] = [{
  provider: "gemini", model_id: "nano-banana-2", currency: "USD", source_kind: "provider",
  source_url: "https://ai.google.dev/gemini-api/docs/pricing", checked_at: "2026-10-31T12:00:00Z",
  excludes_input_cost: true, rates: [{unit: "image", microusd: 67200}],
}];
