import type { VideoTransport } from "./types";
import type { VideoModelConfig } from "../config-schema";
import type { VideoGenerationSettings } from "../types";
import { submitFalQueue, pollFalResult, uploadImageToFal } from "../fal-shared";
import { fetch } from "../http";

export const falVideoTransport: VideoTransport = {
  async generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings: VideoGenerationSettings
  ): Promise<Blob> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const mapping = config.paramMapping ?? {};

    // Pick endpoint based on whether we have an image
    const endpointId =
      imageBase64 && opts.imageToVideoEndpoint
        ? opts.imageToVideoEndpoint
        : opts.textToVideoEndpoint ?? opts.imageToVideoEndpoint!;

    // Build input from fixed params + prompt
    const input: Record<string, unknown> = {
      prompt,
      ...(config.fixedParams ?? {}),
    };

    // Map settings to API field names via paramMapping
    if (mapping.duration) input[mapping.duration] = settings.duration;
    if (mapping.aspectRatio && settings.aspectRatio)
      input[mapping.aspectRatio] = settings.aspectRatio;
    if (mapping.resolution && settings.resolution)
      input[mapping.resolution] = settings.resolution;
    if (mapping.audio !== undefined && settings.audio !== undefined)
      input[mapping.audio] = settings.audio;

    // Handle image input for I2V
    if (imageBase64) {
      const imageUrl = uploadImageToFal(imageBase64);
      const imageKey = mapping.imageInput ?? "image_url";
      input[imageKey] = imageUrl;
    }

    // Submit and poll
    const requestId = await submitFalQueue(endpointId, input, apiKey);
    const result = await pollFalResult<{ video: { url: string } }>(
      endpointId,
      requestId,
      apiKey
    );

    // Download video
    const videoRes = await fetch(result.video.url);
    if (!videoRes.ok)
      throw new Error(`Failed to download fal video: ${videoRes.status}`);
    return videoRes.blob();
  },
};
