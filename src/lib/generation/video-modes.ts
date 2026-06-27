import type {
  VideoGenerationMode,
  VideoGenerationRequest,
  VideoModelModeCapabilities,
} from "./types";

interface ModeChoiceInput {
  hasStartImage: boolean;
}

export function chooseVideoGenerationMode(
  capabilities: VideoModelModeCapabilities,
  input: ModeChoiceInput
): VideoGenerationMode {
  if (!capabilities) {
    throw new Error("Video model capabilities are unavailable");
  }

  if (input.hasStartImage && capabilities.imageToVideo) {
    return "image-to-video";
  }

  return "text-to-video";
}

export function validateVideoGenerationRequest(
  capabilities: VideoModelModeCapabilities,
  request: VideoGenerationRequest
): void {
  if (!capabilities) {
    throw new Error("Video model capabilities are unavailable");
  }

  if (request.mode === "text-to-video") {
    if (!capabilities.textToVideo) {
      throw new Error("Selected model does not support text-to-video");
    }
    return;
  }

  // image-to-video
  if (!capabilities.imageToVideo) {
    throw new Error("Selected model does not support image-to-video");
  }
  if (!request.startImage) {
    throw new Error("image-to-video requires a start frame");
  }
  if (request.endImage && !capabilities.imageToVideo.supportsEndImage) {
    throw new Error("Selected model does not support an end frame");
  }
}
