import { z } from "zod";
import { fetch } from "./models/http";
import type { GenerationPrice } from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

const unitPriceSchema = z.object({
  prices: z.array(
    z.object({
      endpoint_id: z.string(),
      unit_price: z.number().finite().nonnegative(),
      unit: z.string(),
      currency: z.string(),
    }),
  ),
});
const historicalSchema = z.object({
  estimate_type: z.literal("historical_api_price"),
  total_cost: z.number().finite().nonnegative(),
  currency: z.literal("USD"),
});
const failure = (message: string): Result<never> => ({
  ok: false,
  error: { code: "IO_ERROR", message },
});
export async function getFalPrice(
  modelId: string,
  endpoint: string,
  apiKey: string,
): Promise<Result<GenerationPrice>> {
  const source = "https://api.fal.ai/v1/models/pricing";
  const headers = {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
  };
  try {
    const pricing = await fetch(
      `${source}?${new URLSearchParams({ endpoint_id: endpoint })}`,
      { headers },
    );
    if (!pricing.ok)
      return failure(
        `FAL live pricing is unavailable (${pricing.status}). Check the provider key and try again.`,
      );
    const parsed = unitPriceSchema.safeParse(await pricing.json());
    const unit = parsed.success
      ? parsed.data.prices.find(
          (item) => item.endpoint_id === endpoint && item.currency === "USD",
        )
      : null;
    if (!unit)
      return failure(
        "FAL did not return a USD rate for this generation endpoint.",
      );
    const estimate = await fetch(`${source}/estimate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        estimate_type: "historical_api_price",
        endpoints: { [endpoint]: { call_quantity: 1 } },
      }),
    });
    if (!estimate.ok)
      return failure(
        `FAL returned its unit rate, but a per-request estimate is unavailable (${estimate.status}). Billing units can vary with settings.`,
      );
    const historical = historicalSchema.safeParse(await estimate.json());
    if (!historical.success)
      return failure("FAL returned an unsupported cost estimate.");
    const amount = Math.round(historical.data.total_cost * 1000000);
    const unitAmount = Math.round(unit.unit_price * 1000000);
    if (![amount, unitAmount].every(Number.isSafeInteger))
      return failure("The FAL price is outside the supported USD range.");
    return {
      ok: true,
      value: {
        provider: "fal",
        model_id: modelId,
        currency: "USD",
        source_kind: "provider",
        source_url: `${source}/estimate`,
        checked_at: new Date().toISOString(),
        endpoint_id: endpoint,
        estimate_basis: "historical_request",
        billing_unit: unit.unit,
        billing_unit_microusd: unitAmount,
        rates: [{ unit: "request", microusd: amount }],
      },
    };
  } catch {
    return failure(
      "Could not fetch FAL live pricing. No confirmed charge is available.",
    );
  }
}
