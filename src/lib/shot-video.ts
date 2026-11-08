import { getShotEndFrameBase64, getShotImageBase64 } from "./backend-api";
import {
  chooseVideoGenerationMode,
  validateVideoGenerationRequest,
} from "./generation/video-modes";
import type {
  VideoGenerationMode,
  VideoGenerationRequest,
} from "./generation/types";
import type { VideoGenerationSettings, VideoModelInfo } from "./models/types";
import type { GenerationCostRequest } from "../../shared/generation-cost";

/** How a shot video is priced, in the storyboard, the video action and agent quotes alike. */
export function videoCostRequest(
  settings: VideoGenerationSettings,
  mode: VideoGenerationMode | undefined,
  hasEndFrame: boolean,
): GenerationCostRequest {
  return {
    kind: "video",
    duration: settings.duration,
    resolution: settings.resolution,
    audio: settings.audio,
    aspect_ratio: settings.aspectRatio,
    mode,
    has_end_frame: hasEndFrame,
  };
}

/** Chooses the mode and frames for a shot video as the storyboard does, throwing when the model cannot make it. */
export function planShotVideo(
  model: Pick<VideoModelInfo, "modeCapabilities">,
  frames: { hasStartFrame: boolean; hasEndFrame: boolean },
  settings: VideoGenerationSettings,
  prompt: string,
) {
  const mode = chooseVideoGenerationMode(model.modeCapabilities, {
    hasStartImage: frames.hasStartFrame,
  });
  const usesEndFrame =
    mode === "image-to-video" &&
    model.modeCapabilities.imageToVideo?.supportsEndImage === true &&
    frames.hasEndFrame;
  validateVideoGenerationRequest(model.modeCapabilities, {
    mode,
    prompt,
    settings,
    startImage: frames.hasStartFrame ? "start frame" : null,
    endImage: usesEndFrame ? "end frame" : null,
  });
  return { mode, usesEndFrame };
}

/** Builds the storyboard's video request for a shot, loading the frames it uses. */
export async function buildShotVideoRequest(
  shotId: string,
  model: Pick<VideoModelInfo, "modeCapabilities">,
  frames: { hasStartFrame: boolean; hasEndFrame: boolean },
  settings: VideoGenerationSettings,
  prompt: string,
): Promise<VideoGenerationRequest> {
  const startImage = frames.hasStartFrame ? await getShotImageBase64(shotId) : null;
  const { mode, usesEndFrame } = planShotVideo(
    model,
    { hasStartFrame: !!startImage, hasEndFrame: frames.hasEndFrame },
    settings,
    prompt,
  );
  return {
    mode,
    prompt,
    settings,
    startImage,
    endImage: usesEndFrame ? await getShotEndFrameBase64(shotId) : null,
  };
}
