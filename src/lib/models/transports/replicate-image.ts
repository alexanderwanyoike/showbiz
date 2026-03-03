import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";
import {
  createPrediction,
  pollPrediction,
  downloadReplicateOutput,
} from "../replicate-shared";
import { blobToBase64 } from "../types";

export const replicateImageTransport: ImageTransport = {
  async generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string
  ): Promise<string> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const model = opts.model ?? config.models.generate;

    const input: Record<string, unknown> = {
      prompt,
      ...(config.fixedParams ?? {}),
    };

    // Use Prefer: wait for fast models (e.g. Flux Schnell)
    const preferWait = opts.preferWait === "true";
    let prediction = await createPrediction(model, input, apiKey, preferWait);

    if (prediction.status !== "succeeded") {
      prediction = await pollPrediction(prediction.id, apiKey);
    }

    // Extract image URL from output
    const output = prediction.output;
    const imageUrl =
      typeof output === "string"
        ? output
        : Array.isArray(output)
          ? output[0]
          : null;
    if (!imageUrl) throw new Error("Replicate returned no image output");

    // Download and convert to base64
    const blob = await downloadReplicateOutput(imageUrl);
    return blobToBase64(blob);
  },
};
