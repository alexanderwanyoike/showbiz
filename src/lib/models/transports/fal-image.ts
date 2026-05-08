import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";
import { submitFalQueueRequest, pollFalResult, runFalInference, uploadImageToFal } from "../fal-shared";
import { fetch } from "../http";
import { blobToBase64 } from "../types";

function inferImageMimeType(url: string): string {
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function downloadFirstImage(
  result: { images?: Array<{ url: string }> },
  modelName: string
): Promise<string> {
  if (!result.images?.length) throw new Error("fal.ai returned no images");
  const imageUrl = result.images[0].url;
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok)
    throw new Error(`Failed to download ${modelName} image: ${imgRes.status}`);
  const blob = await imgRes.blob();
  const typedBlob = blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: inferImageMimeType(imageUrl) });
  return blobToBase64(typedBlob);
}

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

    const result = opts.directInference
      ? await runFalInference<{ images: Array<{ url: string }> }>(endpointId, input, apiKey)
      : await (async () => {
          const queueRequest = await submitFalQueueRequest(endpointId, input, apiKey);
          return pollFalResult<{ images: Array<{ url: string }> }>(
            endpointId,
            queueRequest.requestId,
            apiKey,
            {
              statusUrl: queueRequest.statusUrl,
              responseUrl: queueRequest.responseUrl,
            }
          );
        })();

    return downloadFirstImage(result, config.name);
  },

  async editImage(
    config: ImageModelConfig,
    editPrompt: string,
    sourceImageBase64: string,
    apiKey: string
  ): Promise<string> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const endpointId = opts.editEndpoint ?? config.models.edit ?? opts.endpoint ?? config.models.generate;
    const imageInput = config.generationModes?.imageToImage?.imageInput ?? "image_url";
    const input: Record<string, unknown> = {
      prompt: editPrompt,
      [imageInput]: uploadImageToFal(sourceImageBase64),
      ...(config.fixedParams ?? {}),
    };

    const result = opts.directInference
      ? await runFalInference<{ images: Array<{ url: string }> }>(endpointId, input, apiKey)
      : await (async () => {
          const queueRequest = await submitFalQueueRequest(endpointId, input, apiKey);
          return pollFalResult<{ images: Array<{ url: string }> }>(
            endpointId,
            queueRequest.requestId,
            apiKey,
            {
              statusUrl: queueRequest.statusUrl,
              responseUrl: queueRequest.responseUrl,
            }
          );
        })();
    return downloadFirstImage(result, config.name);
  },
};
