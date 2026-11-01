import { DEFAULT_STORYBOARD_MODELS } from "../../shared/model-defaults";
import type { ShotModelOverrides } from "../../shared/shot-models";
export function resolveShotModels(
  shot: Partial<ShotModelOverrides> | null | undefined,
  defaults: { image_model: string; video_model: string },
) {
  return {
    image_model: shot?.image_model ?? defaults.image_model,
    video_model: shot?.video_model ?? defaults.video_model,
  };
}

export function resolveStoryboardModels(saved: Partial<ShotModelOverrides>, availableVideoModels: readonly { id: string }[]) {
  const videoModel = saved.video_model;
  return {
    image_model: saved.image_model || DEFAULT_STORYBOARD_MODELS.image_model,
    video_model: videoModel && availableVideoModels.some((model) => model.id === videoModel) ? videoModel : DEFAULT_STORYBOARD_MODELS.video_model,
  };
}
