import { z } from "zod";
import { fetch } from "./models/http";
import type {
  GenerationPrice,
  GenerationPriceRate,
} from "../../shared/generation-cost";

const catalogSchema = z.object({ data: z.array(z.unknown()) });
const modelSchema = z.object({
  id: z.string(),
  supported_resolutions: z.array(z.string()),
  pricing_skus: z.record(z.string(), z.union([z.string(), z.number()])),
});
export async function getOpenRouterVideoPrice(
  modelId: string,
  slug: string,
): Promise<GenerationPrice | null> {
  const url = "https://openrouter.ai/api/v1/videos/models";
  const response = await fetch(url);
  if (!response.ok) return null;
  const parsed = catalogSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  const selected = parsed.data.data.find((item) =>
    typeof item === "object" && item !== null && "id" in item && item.id === slug
  );
  const validated = modelSchema.safeParse(selected);
  if (!validated.success) return null;
  const model = validated.data;
  const rates: GenerationPriceRate[] = [];
  for (const resolution of model.supported_resolutions) {
    for (const audio of [false, true]) {
      const prefix = `duration_seconds_${audio ? "with_audio" : "without_audio"}`;
      const suffix = resolution.toLowerCase();
      const candidates = [
        `${prefix}_${suffix}`,
        prefix,
        `duration_seconds_${suffix}`,
        "duration_seconds",
        `per-video-second-${suffix}`,
        "per-video-second",
      ];
      const key = candidates.find(
        (candidate) => model.pricing_skus[candidate] !== undefined,
      );
      if (!key) continue;
      const amount = Math.round(Number(model.pricing_skus[key]) * 1000000);
      if (!Number.isSafeInteger(amount) || amount < 0) continue;
      rates.push({ unit: "second", microusd: amount, resolution, audio });
    }
  }
  return rates.length
    ? {
        provider: "openrouter",
        model_id: modelId,
        currency: "USD",
        source_kind: "provider",
        source_url: url,
        checked_at: new Date().toISOString(),
        rates,
      }
    : null;
}
