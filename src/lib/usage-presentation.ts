import type { GenerationUsage } from "../../shared/generation-usage";
import { API_KEY_PROVIDERS } from "../../shared/provider-catalog";
import { imageConfigs, videoConfigs } from "./models/registry";
import { modelProviderName } from "./model-provider";
import {
  formatGenerationCost,
  formatGenerationEstimate,
} from "./generation-usage";

export const usageKindName = {
  image: "Image generation",
  image_edit: "Image edit",
  image_compose: "Image composition",
  video: "Video generation",
};
export const usageOutcomeName = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
export function usageIdentity(item: GenerationUsage) {
  const model = [...imageConfigs, ...videoConfigs].find(
    (entry) => entry.id === item.model_id,
  );
  const provider = API_KEY_PROVIDERS.find(
    (entry) => entry.id === item.provider,
  );
  return {
    model: model?.name ?? item.model_id,
    provider: provider?.name ?? modelProviderName(model) ?? item.provider,
  };
}
export function usageCharge(item: GenerationUsage) {
  if (item.reported_microusd !== null)
    return `${formatGenerationCost(item.reported_microusd)} reported`;
  if (
    item.estimated_min_microusd !== null &&
    item.estimated_max_microusd !== null
  )
    return `~${formatGenerationEstimate(item.estimated_min_microusd, item.estimated_max_microusd)} estimated`;
  return "Unknown";
}
