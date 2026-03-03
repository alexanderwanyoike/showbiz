import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";
import { submitFalQueue, pollFalResult } from "../fal-shared";
import { fetch } from "../http";
import { blobToBase64 } from "../types";

export const falImageTransport: ImageTransport = {
  async generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string
  ): Promise<string> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const endpointId = opts.endpoint ?? config.models.generate;

    const input: Record<string, unknown> = {
      prompt,
      ...(config.fixedParams ?? {}),
    };

    const requestId = await submitFalQueue(endpointId, input, apiKey);
    const result = await pollFalResult<{
      images: Array<{ url: string }>;
    }>(endpointId, requestId, apiKey);

    if (!result.images?.length) throw new Error("fal.ai returned no images");

    // Download image and convert to base64
    const imgRes = await fetch(result.images[0].url);
    if (!imgRes.ok)
      throw new Error(`Failed to download fal image: ${imgRes.status}`);
    const blob = await imgRes.blob();

    return blobToBase64(blob);
  },
};
