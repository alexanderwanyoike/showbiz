import type {
  ImageModelId,
  VideoModelId,
  ImageModelProvider,
  VideoModelProvider,
  ImageModelInfo,
  VideoModelInfo,
} from "./types";
import { videoProviders, imageProviders, videoConfigs, imageConfigs, getGroupedVideoModels, getGroupedImageModels, type ModelGroup } from "./registry";

export function getImageModel(id: ImageModelId): ImageModelProvider {
  const model = imageProviders.get(id);
  if (!model) {
    throw new Error(`Unknown image model: ${id}`);
  }
  return model;
}

export function getVideoModel(id: VideoModelId): VideoModelProvider {
  const model = videoProviders.get(id);
  if (!model) {
    throw new Error(`Unknown video model: ${id}`);
  }
  return model;
}

export function getAvailableImageModels(): ImageModelInfo[] {
  return Array.from(imageProviders.values())
    .filter((model) => model.enabled)
    .map((model) => {
      const config = imageConfigs.find((c) => c.id === model.id);
      return {
        id: model.id,
        name: model.name,
        description: model.description,
        enabled: model.enabled,
        apiKeyProvider: model.apiKeyProvider,
        provider: config?.provider,
        supportsImageEditing: model.supportsImageEditing,
        supportsInpainting: model.supportsInpainting,
      };
    });
}

export function getAvailableVideoModels(): VideoModelInfo[] {
  return Array.from(videoProviders.values())
    .filter((model) => model.enabled)
    .map((model) => {
      const config = videoConfigs.find((c) => c.id === model.id);
      return {
        id: model.id,
        name: model.name,
        description: model.description,
        enabled: model.enabled,
        apiKeyProvider: model.apiKeyProvider,
        provider: config?.provider,
        capabilities: model.capabilities,
        defaults: model.defaults,
        supportsImageToVideo: model.supportsImageToVideo,
        supportsTextToVideo: model.supportsTextToVideo,
      };
    });
}

export { getGroupedVideoModels, getGroupedImageModels };
export type { ImageModelId, VideoModelId, ImageModelInfo, VideoModelInfo, ModelGroup };
