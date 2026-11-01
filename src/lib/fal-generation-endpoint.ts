import type {
  ImageModelConfig,
  VideoModelConfig,
} from "./models/config-schema";
import type { GenerationCostRequest } from "../../shared/generation-cost";

export function falGenerationEndpoint(
  config: ImageModelConfig | VideoModelConfig,
  request: GenerationCostRequest,
): string | undefined {
  const options = config.transportOptions ?? {};
  let endpoint: string | undefined;
  if (request.kind === "video" && "imageToVideo" in config.models) {
    const video = "capabilities" in config ? config : undefined;
    endpoint =
      request.mode === "text-to-video"
        ? (video?.generationModes?.textToVideo?.endpoint ??
          String(
            options.textToVideoEndpoint ?? config.models.textToVideo ?? "",
          ))
        : request.has_end_frame &&
            video?.generationModes?.imageToVideo?.endFrameEndpoint
          ? video.generationModes.imageToVideo.endFrameEndpoint.endpoint
          : (video?.generationModes?.imageToVideo?.endpoint ??
            String(
              options.imageToVideoEndpoint ?? config.models.imageToVideo ?? "",
            ));
  } else if ("generate" in config.models) {
    endpoint =
      request.kind === "image"
        ? String(options.endpoint ?? config.models.generate)
        : String(
            options.editEndpoint ??
              config.models.edit ??
              options.endpoint ??
              config.models.generate,
          );
  }
  return endpoint;
}
