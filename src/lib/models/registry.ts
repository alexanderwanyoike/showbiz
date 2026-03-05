import type {
  ImageModelId,
  VideoModelId,
  ImageModelProvider,
  VideoModelProvider,
  VideoGenerationSettings,
  VideoModelInfo,
  ImageModelInfo,
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
    apiKeyProvider: config.apiKeyProvider as "gemini" | "ltx" | "kie" | "fal" | "replicate",
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
    apiKeyProvider: config.apiKeyProvider as "gemini" | "ltx" | "kie" | "fal" | "replicate",
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

export interface ModelGroup<T> {
  family: string;
  displayName: string;
  models: T[];
}

function getDisplayName(familyModels: { name: string; provider?: string }[]): string {
  // Use the model name from any entry (they should share the same base name)
  return familyModels[0].name;
}

export function getGroupedVideoModels(): ModelGroup<VideoModelInfo>[] {
  const enabled = Array.from(videoProviders.values()).filter((m) => m.enabled);
  const familyMap = new Map<string, { info: VideoModelInfo; config: VideoModelConfig }[]>();

  for (const provider of enabled) {
    const config = videoConfigs.find((c) => c.id === provider.id);
    const family = config?.modelFamily ?? provider.id;
    const info: VideoModelInfo = {
      id: provider.id,
      name: provider.name,
      description: provider.description,
      enabled: provider.enabled,
      apiKeyProvider: provider.apiKeyProvider,
      provider: config?.provider,
      capabilities: provider.capabilities,
      defaults: provider.defaults,
      supportsImageToVideo: provider.supportsImageToVideo,
      supportsTextToVideo: provider.supportsTextToVideo,
    };
    if (!familyMap.has(family)) familyMap.set(family, []);
    familyMap.get(family)!.push({ info, config: config! });
  }

  const groups: ModelGroup<VideoModelInfo>[] = [];
  for (const [family, entries] of familyMap) {
    // Sort models within group by provider name
    entries.sort((a, b) => (a.config?.provider ?? "").localeCompare(b.config?.provider ?? ""));
    groups.push({
      family,
      displayName: getDisplayName(entries.map((e) => ({ name: e.info.name, provider: e.config?.provider }))),
      models: entries.map((e) => e.info),
    });
  }

  // Sort groups alphabetically by displayName
  groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return groups;
}

export function getGroupedImageModels(): ModelGroup<ImageModelInfo>[] {
  const enabled = Array.from(imageProviders.values()).filter((m) => m.enabled);
  const familyMap = new Map<string, { info: ImageModelInfo; config: ImageModelConfig }[]>();

  for (const provider of enabled) {
    const config = imageConfigs.find((c) => c.id === provider.id);
    const family = config?.modelFamily ?? provider.id;
    const info: ImageModelInfo = {
      id: provider.id,
      name: provider.name,
      description: provider.description,
      enabled: provider.enabled,
      apiKeyProvider: provider.apiKeyProvider,
      provider: config?.provider,
      supportsImageEditing: provider.supportsImageEditing,
      supportsInpainting: provider.supportsInpainting,
    };
    if (!familyMap.has(family)) familyMap.set(family, []);
    familyMap.get(family)!.push({ info, config: config! });
  }

  const groups: ModelGroup<ImageModelInfo>[] = [];
  for (const [family, entries] of familyMap) {
    entries.sort((a, b) => (a.config?.provider ?? "").localeCompare(b.config?.provider ?? ""));
    groups.push({
      family,
      displayName: getDisplayName(entries.map((e) => ({ name: e.info.name, provider: e.config?.provider }))),
      models: entries.map((e) => e.info),
    });
  }

  groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return groups;
}
