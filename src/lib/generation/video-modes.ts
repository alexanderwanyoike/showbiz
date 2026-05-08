import type {
  GenerationReference,
  VideoGenerationMode,
  VideoGenerationRequest,
  VideoModelModeCapabilities,
} from "./types";

interface ModeChoiceInput {
  hasStartImage: boolean;
  references: GenerationReference[];
}

function imageReferenceCount(references: GenerationReference[] = []): number {
  return references.filter((ref) => ref.mediaType === "image").length;
}

export function chooseVideoGenerationMode(
  capabilities: VideoModelModeCapabilities,
  input: ModeChoiceInput
): VideoGenerationMode {
  if (!capabilities) {
    throw new Error("Video model capabilities are unavailable");
  }

  if (
    input.references.length > 0 &&
    imageReferenceCount(input.references) > 0 &&
    capabilities.referenceToVideo
  ) {
    return "reference-to-video";
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

  if (request.mode === "image-to-video") {
    if (!capabilities.imageToVideo) {
      throw new Error("Selected model does not support image-to-video");
    }
    if (!request.startImage) {
      throw new Error("image-to-video requires a start image");
    }
    return;
  }

  if (!capabilities.referenceToVideo) {
    throw new Error("Selected model does not support reference-to-video");
  }

  const imageRefs = imageReferenceCount(request.references ?? []);
  if (imageRefs === 0) {
    throw new Error("reference-to-video requires at least one image reference");
  }

  const max = capabilities.referenceToVideo.imageReferencesMax;
  if (max !== undefined && imageRefs > max) {
    throw new Error(`Selected model supports at most ${max} image references`);
  }
}
