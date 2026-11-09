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

/** How a shot video is priced, in the storyboard, the video action and agent jobs alike. */
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

/** Chooses the mode and whether the end frame is used, as the storyboard does, without validating. */
export function chooseShotVideoFrames(
  model: Pick<VideoModelInfo, "modeCapabilities">,
  frames: { hasStartFrame: boolean; hasEndFrame: boolean },
) {
  const mode = chooseVideoGenerationMode(model.modeCapabilities, {
    hasStartImage: frames.hasStartFrame,
  });
  const usesEndFrame =
    mode === "image-to-video" &&
    model.modeCapabilities.imageToVideo?.supportsEndImage === true &&
    frames.hasEndFrame;
  return { mode, usesEndFrame };
}

/** Chooses the mode and frames for a shot video, throwing when the model cannot make it. */
export function planShotVideo(
  model: Pick<VideoModelInfo, "modeCapabilities">,
  frames: { hasStartFrame: boolean; hasEndFrame: boolean },
  settings: VideoGenerationSettings,
  prompt: string,
) {
  const plan = chooseShotVideoFrames(model, frames);
  validateVideoGenerationRequest(model.modeCapabilities, {
    mode: plan.mode,
    prompt,
    settings,
    startImage: frames.hasStartFrame ? "start frame" : null,
    endImage: plan.usesEndFrame ? "end frame" : null,
  });
  return plan;
}

/** A content digest that tells whether a frame changed, since end frames are overwritten in place. */
export async function digestOf(dataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(dataUrl);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const request = {
    mode,
    prompt,
    settings,
    startImage,
    endImage: usesEndFrame ? await getShotEndFrameBase64(shotId) : null,
  };
  validateVideoGenerationRequest(model.modeCapabilities, request);
  return request;
}
