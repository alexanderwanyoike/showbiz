import type { VideoTransport } from "./types";
import type { VideoModelConfig } from "../config-schema";
import type { VideoGenerationSettings } from "../types";
import {
  createPrediction,
  pollPrediction,
  downloadReplicateOutput,
} from "../replicate-shared";

export const replicateVideoTransport: VideoTransport = {
  async generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings: VideoGenerationSettings
  ): Promise<Blob> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const mapping = config.paramMapping ?? {};

    // Pick model based on whether we have an image
    const model =
      imageBase64 && opts.model
        ? opts.model
        : opts.textToVideoModel ?? opts.model!;

    // Build input from fixed params + dynamic settings
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

    // Handle image input for I2V — Replicate accepts data URIs
    if (imageBase64) {
      const imageKey = mapping.imageInput ?? "image";
      const dataUri = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
      input[imageKey] = dataUri;
    }

    // Create prediction and poll
    let prediction = await createPrediction(model, input, apiKey);
    if (prediction.status !== "succeeded") {
      prediction = await pollPrediction(prediction.id, apiKey);
    }

    // Extract video URL from output
    const output = prediction.output;
    const videoUrl =
      typeof output === "string"
        ? output
        : Array.isArray(output)
          ? output[0]
          : null;
    if (!videoUrl) throw new Error("Replicate returned no video output");

    // Download immediately (URLs expire in ~1 hour)
    return downloadReplicateOutput(videoUrl);
  },
};
