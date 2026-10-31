import type { Result } from "../../shared/result";
import type { VideoModelInfo } from "./models/types";

export function shotGenerationReadiness(
  shot: {
    image_url: string | null;
    end_frame_url: string | null;
    video_prompt: string | null;
  },
  model: VideoModelInfo | null,
): Result<null> {
  const failure = (message: string): Result<never> => ({
    ok: false,
    error: { code: "INVALID_INPUT", message },
  });
  if (!model)
    return failure("Choose an available video model before generating.");
  if (shot.image_url && model.modeCapabilities.imageToVideo) {
    if (
      model.modeCapabilities.imageToVideo.requiresEndImage &&
      !shot.end_frame_url
    )
      return failure(`Add an end frame for ${model.name} before generating.`);
    return { ok: true, value: null };
  }
  if (!model.modeCapabilities.textToVideo)
    return failure(`Add a start frame for ${model.name} before generating.`);
  if (!shot.video_prompt?.trim())
    return failure("Add a video prompt before generating.");
  return { ok: true, value: null };
}
