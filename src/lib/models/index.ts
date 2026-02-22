import {
  ImageModelId,
  VideoModelId,
  ImageModelProvider,
  VideoModelProvider,
  ImageModelInfo,
  VideoModelInfo,
} from "./types";
import { imagenProvider } from "./imagen";
import { nanoBananaProvider } from "./nano-banana";
import { nanoBananaProProvider } from "./nano-banana-pro";
import { veoProvider } from "./veo";
import { veoFastProvider } from "./veo-fast";
import { ltxVideoProvider } from "./ltx-video";

// Image model registry
const imageModels: Map<ImageModelId, ImageModelProvider> = new Map([
  ["imagen4", imagenProvider],
  ["nano-banana", nanoBananaProvider],
  ["nano-banana-pro", nanoBananaProProvider],
]);

// Video model registry
const videoModels: Map<VideoModelId, VideoModelProvider> = new Map([
  ["veo3", veoProvider],
  ["veo3-fast", veoFastProvider],
  ["ltx-video", ltxVideoProvider],
]);

// Get image model provider by ID
export function getImageModel(id: ImageModelId): ImageModelProvider {
  const model = imageModels.get(id);
  if (!model) {
    throw new Error(`Unknown image model: ${id}`);
  }
  return model;
}

// Get video model provider by ID
export function getVideoModel(id: VideoModelId): VideoModelProvider {
  const model = videoModels.get(id);
  if (!model) {
    throw new Error(`Unknown video model: ${id}`);
  }
  return model;
}

// Get all available image models (for UI dropdowns)
export function getAvailableImageModels(): ImageModelInfo[] {
  return Array.from(imageModels.values()).map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    apiKeyProvider: model.apiKeyProvider,
  }));
}

// Get all available video models (for UI dropdowns)
export function getAvailableVideoModels(): VideoModelInfo[] {
  return Array.from(videoModels.values()).map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    apiKeyProvider: model.apiKeyProvider,
    supportsImageToVideo: model.supportsImageToVideo,
    supportsTextToVideo: model.supportsTextToVideo,
  }));
}

// Re-export types
export type { ImageModelId, VideoModelId, ImageModelInfo, VideoModelInfo };
