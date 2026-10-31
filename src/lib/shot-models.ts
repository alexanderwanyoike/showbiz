import type { ShotModelOverrides } from "../../shared/shot-models";
export function resolveShotModels(
  shot: Partial<ShotModelOverrides> | null | undefined,
  defaults: {image_model:string;video_model:string},
) {
  return {
    image_model: shot?.image_model ?? defaults.image_model,
    video_model: shot?.video_model ?? defaults.video_model,
  };
}
