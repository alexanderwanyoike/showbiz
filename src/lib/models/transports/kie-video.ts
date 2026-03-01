import type { VideoTransport } from "./types";
import type { VideoModelConfig } from "../config-schema";
import type { VideoGenerationSettings } from "../types";
import { generateKieVideoBlob } from "../kie-shared";

export const kieVideoTransport: VideoTransport = {
  async generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings: VideoGenerationSettings
  ): Promise<Blob> {
    const mapping = config.paramMapping ?? {};
    const imageFormat = mapping.imageFormat ?? "array";
    const imageInputKey = mapping.imageInput ?? "image_urls";

    // Pick model ID based on whether we have an image
    const modelId = imageBase64 && config.models.imageToVideo
      ? config.models.imageToVideo
      : config.models.textToVideo ?? config.models.imageToVideo!;

    // Build input from fixed params + dynamic settings
    const input: Record<string, unknown> = {
      prompt,
      ...(config.fixedParams ?? {}),
    };

    // Map settings to API field names via paramMapping
    if (mapping.duration) {
      input[mapping.duration] = settings.duration;
    }
    if (mapping.resolution && settings.resolution) {
      input[mapping.resolution] = settings.resolution;
    }
    if (mapping.aspectRatio && settings.aspectRatio) {
      input[mapping.aspectRatio] = settings.aspectRatio;
    }
    if (mapping.audio !== undefined && settings.audio !== undefined) {
      input[mapping.audio] = settings.audio;
    }

    // Determine effective image input key format
    const effectiveImageKey = imageFormat === "string" ? imageInputKey : imageInputKey;
    // For "string" format, generateKieVideoBlob handles singular vs array based on key name
    // We use the key directly - kie-shared handles "image_url" (string) vs others (array)
    const blobImageKey = imageFormat === "string"
      ? imageInputKey  // e.g. "image_url" — kie-shared treats this as singular string
      : imageInputKey; // e.g. "image_urls" — kie-shared wraps in array

    return generateKieVideoBlob(modelId, input, imageBase64, apiKey, blobImageKey);
  },
};
