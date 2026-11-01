import { z } from "zod";
import { fetch } from "./models/http";
import type { GenerationPrice } from "../../shared/generation-cost";

const imageEndpoints = z.object({
  endpoints: z.array(
    z.object({
      pricing: z.array(
        z.object({
          billable: z.string(),
          unit: z.string(),
          cost_usd: z.number().nonnegative(),
          variant: z.string().optional(),
        }),
      ),
    }),
  ),
});
export async function getOpenRouterImagePrice(
  modelId: string,
  slug: string,
): Promise<GenerationPrice | null> {
  const url = `https://openrouter.ai/api/v1/images/models/${slug.split("/").map(encodeURIComponent).join("/")}/endpoints`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const parsed = imageEndpoints.safeParse(await response.json());
  if (!parsed.success) return null;
  const outputs = parsed.data.endpoints.flatMap((endpoint) =>
    endpoint.pricing.filter((price) => price.billable === "output_image"),
  );
  if (
    !outputs.length ||
    outputs.some(
      (price) =>
        (price.unit !== "image" &&
          !(
            price.unit === "token" && slug === "google/gemini-3.1-flash-image"
          )) ||
        price.variant,
    )
  )
    return null;
  // The default 1K Gemini 3.1 Flash Image output is 1120 tokens. Other sizes
  // have different token counts: https://ai.google.dev/gemini-api/docs/pricing
  const defaultImageOutputTokens = 1120;
  const amounts = outputs.map((price) =>
    Math.round(
      price.cost_usd *
        (price.unit === "token" ? defaultImageOutputTokens : 1) *
        1000000,
    ),
  );
  if (amounts.some((value) => !Number.isSafeInteger(value))) return null;
  return {
    provider: "openrouter",
    model_id: modelId,
    currency: "USD",
    source_kind: "provider",
    source_url: url,
    checked_at: new Date().toISOString(),
    excludes_input_cost: true,
    rates: [
      {
        unit: "image",
        microusd: Math.min(...amounts),
        max_microusd: Math.max(...amounts),
      },
    ],
  };
}
