import { getOpenRouterVideoPrice } from "./openrouter-video-pricing";
import { invoke } from "./bridge";
import { imageConfigs, videoConfigs } from "./models/registry";
import { getOpenRouterImagePrice } from "./openrouter-pricing";
import { estimateGenerationCost, type GenerationCostRequest, type GenerationCostEstimate, type GenerationPrice } from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

const rateLookups = new Map<string, Promise<Result<GenerationPrice | null>>>();
async function refreshPrice(modelId: string, kind: string, load: () => Promise<GenerationPrice | null>): Promise<Result<GenerationPrice | null>> {
  const key = `${kind}:${modelId}`;
  const existing = rateLookups.get(key);
  if (existing) return existing;
  const operation: Promise<Result<GenerationPrice | null>> = (async () => {
    const fresh = await load().catch(() => null);
    return fresh ? invoke<Result<GenerationPrice>>("save_generation_price", {kind, price: fresh}) : {ok: true, value: null};
  })();
  rateLookups.set(key, operation);
  try { return await operation; } finally { rateLookups.delete(key); }
}

export async function getGenerationEstimate(modelId: string, request: GenerationCostRequest): Promise<GenerationCostEstimate> {
  const config = request.kind === "video" ? videoConfigs.find(model => model.id === modelId) : imageConfigs.find(model => model.id === modelId);
  if (!config?.enabled) return { kind: "unavailable", reason: "Choose an available generation model." };
  try {
    const stored = await invoke<Result<GenerationPrice | null>>("get_generation_price", { model_id: modelId, kind: request.kind });
    if (!stored.ok) return {kind: "unavailable", reason: stored.error.message};
    const quantities = {...request, duration: typeof request.duration === "string" ? request.duration.replace(/s$/, "") : request.duration};
    if (request.kind === "video" && request.duration === "auto" && config.apiKeyProvider !== "local" && "capabilities" in config) {
      const durations = config.capabilities.durations.map(value => Number(value.replace(/s$/, ""))).filter(value => Number.isFinite(value) && value > 0);
      if (durations.length) quantities.duration_range = [Math.min(...durations), Math.max(...durations)];
    }
    let price = stored.value;
    if (price && price.provider !== config.apiKeyProvider) price = null;
    const needsRefresh = !price || (price.source_kind !== "manual" && (!Number.isFinite(Date.parse(price.checked_at)) || Date.now() - Date.parse(price.checked_at) > 7 * 24 * 60 * 60 * 1000));
    if (needsRefresh && config.apiKeyProvider === "openrouter") {
      const refreshed = await refreshPrice(modelId, request.kind, async () => {
        if (request.kind === "video" && "imageToVideo" in config.models) {
          const slug = config.models.imageToVideo ?? config.models.textToVideo;
          return slug ? getOpenRouterVideoPrice(modelId, slug) : null;
        }
        return "generate" in config.models ? getOpenRouterImagePrice(modelId, config.models.generate) : null;
      });
      if (!refreshed.ok) return {kind: "unavailable", reason: refreshed.error.message};
      price = refreshed.value ?? price;
      if (!price) return {kind: "unavailable", reason: "A live rate is not available for this provider and model."};
    }
    return estimateGenerationCost(price, quantities);
  } catch { return {kind: "unavailable", reason: "Could not load provider pricing. The final charge is unknown until the provider reports it."}; }
}
