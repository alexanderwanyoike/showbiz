import type { VideoTransport } from "./types";
import type { VideoModelConfig } from "../config-schema";
import type { VideoGenerationSettings } from "../types";
import { generateVeoVideoBlob } from "../veo-shared";

export const googleVideoTransport: VideoTransport = {
  async generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    _settings: VideoGenerationSettings
  ): Promise<Blob> {
    const opts = config.transportOptions ?? {};
    return generateVeoVideoBlob(prompt, imageBase64, apiKey, {
      modelId: config.models.imageToVideo ?? config.models.textToVideo!,
      modelName: config.name,
      initialPollInterval: (opts.initialPollInterval as number) ?? 5000,
      maxPollInterval: (opts.maxPollInterval as number) ?? 10000,
    });
  },
};
