import type {
  ImageModelId,
  VideoModelId,
  ImageModelProvider,
  VideoModelProvider,
  VideoGenerationSettings,
} from "./types";
import { blobToBase64 } from "./types";
import {
  validateVideoConfig,
  validateImageConfig,
  type VideoModelConfig,
  type ImageModelConfig,
} from "./config-schema";
import { getVideoTransport, getImageTransport } from "./transports";

// Eagerly import all JSON configs via Vite's import.meta.glob
const videoConfigModules = import.meta.glob("./providers/video/*.json", {
  eager: true,
});
const imageConfigModules = import.meta.glob("./providers/image/*.json", {
  eager: true,
});

// Parse and validate all video configs
const videoConfigs: VideoModelConfig[] = [];
for (const [path, mod] of Object.entries(videoConfigModules)) {
  try {
    const raw = (mod as Record<string, unknown>).default ?? mod;
    videoConfigs.push(validateVideoConfig(raw));
  } catch (e) {
    console.error(`Failed to load video config ${path}:`, e);
  }
}

// Parse and validate all image configs
const imageConfigs: ImageModelConfig[] = [];
for (const [path, mod] of Object.entries(imageConfigModules)) {
  try {
    const raw = (mod as Record<string, unknown>).default ?? mod;
    imageConfigs.push(validateImageConfig(raw));
  } catch (e) {
    console.error(`Failed to load image config ${path}:`, e);
  }
}

function videoConfigToProvider(config: VideoModelConfig): VideoModelProvider {
  const transport = getVideoTransport(config.transport);

  return {
    id: config.id as VideoModelId,
    name: config.name,
    description: config.description,
    enabled: config.enabled,
    apiKeyProvider: config.apiKeyProvider as "gemini" | "ltx" | "kie",
    capabilities: config.capabilities,
    defaults: { ...config.defaults },
    supportsImageToVideo: !!config.models.imageToVideo,
    supportsTextToVideo: !!config.models.textToVideo,

    async generateVideo(
      prompt: string,
      imageBase64: string | null,
      apiKey: string,
      settings?: VideoGenerationSettings
    ): Promise<string> {
      const blob = await transport.generateVideo(
        config,
        prompt,
        imageBase64,
        apiKey,
        settings ?? config.defaults
      );
      return blobToBase64(blob);
    },

    async generateVideoBlob(
      prompt: string,
      imageBase64: string | null,
      apiKey: string,
      settings?: VideoGenerationSettings
    ): Promise<Blob> {
      return transport.generateVideo(
        config,
        prompt,
        imageBase64,
        apiKey,
        settings ?? config.defaults
      );
    },
  };
}

function imageConfigToProvider(config: ImageModelConfig): ImageModelProvider {
  const transport = getImageTransport(config.transport);

  const provider: ImageModelProvider = {
    id: config.id as ImageModelId,
    name: config.name,
    description: config.description,
    enabled: config.enabled,
    apiKeyProvider: config.apiKeyProvider as "gemini" | "ltx" | "kie",
    supportsImageEditing: config.supportsEditing,
    supportsInpainting: config.supportsInpainting,

    async generateImage(prompt: string, apiKey: string): Promise<string> {
      return transport.generateImage(config, prompt, apiKey);
    },
  };

  if (config.supportsEditing && transport.editImage) {
    provider.editImage = async (
      prompt: string,
      sourceImageBase64: string,
      apiKey: string
    ): Promise<string> => {
      return transport.editImage!(config, prompt, sourceImageBase64, apiKey);
    };
  }

  return provider;
}

// Build provider maps
export const videoProviders: Map<VideoModelId, VideoModelProvider> = new Map(
  videoConfigs.map((c) => [c.id as VideoModelId, videoConfigToProvider(c)])
);

export const imageProviders: Map<ImageModelId, ImageModelProvider> = new Map(
  imageConfigs.map((c) => [c.id as ImageModelId, imageConfigToProvider(c)])
);

// Export raw configs for testing
export { videoConfigs, imageConfigs };
