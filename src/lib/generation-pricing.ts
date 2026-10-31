import { invoke } from "./bridge";
import { imageConfigs, videoConfigs } from "./models/registry";
import { getOpenRouterImagePrice } from "./openrouter-pricing";
import { estimateGenerationCost, type GenerationCostRequest, type GenerationCostEstimate, type GenerationPrice } from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

export async function getGenerationEstimate(modelId: string, request: GenerationCostRequest): Promise<GenerationCostEstimate> {
  const config = request.kind === "video" ? videoConfigs.find(model => model.id === modelId) : imageConfigs.find(model => model.id === modelId);
  if (!config?.enabled) return { kind: "unavailable", reason: "Choose an available generation model." };
  try {
    const stored = await invoke<Result<GenerationPrice | null>>("get_generation_price", { model_id: modelId, kind: request.kind });
    if (!stored.ok) return {kind: "unavailable", reason: stored.error.message};
    let price = stored.value;
    if (price && price.provider !== config.apiKeyProvider) price = null;
    if (!price && config.apiKeyProvider === "openrouter" && request.kind !== "video" && "generate" in config.models) {
      price = await getOpenRouterImagePrice(modelId, config.models.generate);
      if (price) {
        const saved = await invoke<Result<GenerationPrice>>("save_generation_price", { kind: request.kind, price });
        if (!saved.ok) return {kind: "unavailable", reason: saved.error.message};
      }
    }
    return estimateGenerationCost(price, request);
  } catch { return {kind: "unavailable", reason: "Could not load provider pricing. The final charge is unknown until the provider reports it."}; }
}
