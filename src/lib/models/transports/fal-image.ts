import type { GenerationObserver } from "../../../../shared/generation-output";
import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";
import type { ImageRequestOptions } from "../../../../shared/model-config";
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

// fal models take their shape either as aspect_ratio ("16:9") or as an image_size preset ("landscape_16_9").
const IMAGE_SIZE_PRESETS: Record<string, string> = { "16:9": "landscape_16_9" };
function shapeInput(config: ImageModelConfig, options?: ImageRequestOptions): Record<string, unknown> {
  const ratio = options?.aspectRatio;
  if (!ratio) return {};
  const param = config.transportOptions?.aspectRatioParam;
  if (param === "aspect_ratio") return { aspect_ratio: ratio };
  if (param === "image_size" && IMAGE_SIZE_PRESETS[ratio]) return { image_size: IMAGE_SIZE_PRESETS[ratio] };
  throw new Error(`${config.name} cannot make ${ratio} pictures.`);
}

// Submit an input to a fal image endpoint (direct or queued) and return the
// first result image as a base64 data URL.
async function runFalImageRequest(
  config: ImageModelConfig,
  endpointId: string,
  input: Record<string, unknown>,
  apiKey: string,
  observer?: GenerationObserver
): Promise<string> {
  const opts = (config.transportOptions ?? {}) as Record<string, unknown>;
  const result = opts.directInference
    ? await runFalInference<{ images: Array<{ url: string }> }>(endpointId, input, apiKey, ...(observer ? [observer] as const : []))
    : await (async () => {
        const queueRequest = await submitFalQueueRequest(endpointId, input, apiKey);
        await observer?.receipt({ provider_request_id: queueRequest.requestId, reported_microusd: null });
        return pollFalResult<{ images: Array<{ url: string }> }>(endpointId, queueRequest.requestId, apiKey, {
          statusUrl: queueRequest.statusUrl,
          responseUrl: queueRequest.responseUrl,
        });
      })();
  return downloadFirstImage(result, config.name);
}

export const falImageTransport: ImageTransport = {
  async generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions
  ): Promise<string> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const endpointId = opts.endpoint ?? config.models.generate;
    const input: Record<string, unknown> = { prompt, ...(config.fixedParams ?? {}), ...shapeInput(config, options) };
    return runFalImageRequest(config, endpointId, input, apiKey, observer);
  },

  async editImage(
    config: ImageModelConfig,
    editPrompt: string,
    sourceImageBase64: string,
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions
  ): Promise<string> {
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const endpointId = opts.editEndpoint ?? config.models.edit ?? opts.endpoint ?? config.models.generate;
    const mode = config.generationModes?.imageToImage;
    const imageInput = mode?.imageInput ?? "image_url";
    const uploaded = uploadImageToFal(sourceImageBase64);
    const input: Record<string, unknown> = {
      prompt: editPrompt,
      [imageInput]: mode?.imageFormat === "array" ? [uploaded] : uploaded,
      ...(config.fixedParams ?? {}),
      ...shapeInput(config, options),
    };
    return runFalImageRequest(config, endpointId, input, apiKey, observer);
  },

  // Compose from multiple reference images (e.g. GPT Image 2's /edit endpoint,
  // which takes an `image_urls` array). Used for bible frame composition.
  async composeImage(
    config: ImageModelConfig,
    prompt: string,
    referenceImages: string[],
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions
  ): Promise<string> {
    if (referenceImages.length === 0) {
      throw new Error("composeImage requires at least one reference image");
    }
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const endpointId = opts.editEndpoint ?? config.models.edit ?? opts.endpoint ?? config.models.generate;
    const imageInput = config.generationModes?.imageToImage?.imageInput ?? "image_urls";
    const input: Record<string, unknown> = {
      prompt,
      [imageInput]: referenceImages.map((img) => uploadImageToFal(img)),
      ...(config.fixedParams ?? {}),
      ...shapeInput(config, options),
    };
    return runFalImageRequest(config, endpointId, input, apiKey, observer);
  },
};
