import type { VideoTransport } from "./types";
import type { VideoModelConfig } from "../config-schema";
import type { VideoGenerationSettings } from "../types";
import type { VideoGenerationRequest } from "../../generation/types";
import { submitFalQueueRequest, pollFalResult, uploadImageToFal } from "../fal-shared";
import { fetch } from "../http";

function mapSettings(
  input: Record<string, unknown>,
  config: VideoModelConfig,
  settings: VideoGenerationSettings
) {
  const mapping = config.paramMapping ?? {};
  if (mapping.duration)
    input[mapping.duration] = config.numericDuration ? Number(settings.duration) : settings.duration;
  if (mapping.aspectRatio && settings.aspectRatio)
    input[mapping.aspectRatio] = settings.aspectRatio;
  if (mapping.resolution && settings.resolution)
    input[mapping.resolution] = settings.resolution;
  if (mapping.audio !== undefined && settings.audio !== undefined)
    input[mapping.audio] = settings.audio;
}

async function submitAndDownload(
  endpointId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<Blob> {
  const queueRequest = await submitFalQueueRequest(endpointId, input, apiKey);
  const result = await pollFalResult<{ video: { url: string } }>(
    endpointId,
    queueRequest.requestId,
    apiKey,
    {
      statusUrl: queueRequest.statusUrl,
      responseUrl: queueRequest.responseUrl,
    }
  );
  const videoRes = await fetch(result.video.url);
  if (!videoRes.ok)
    throw new Error(`Failed to download fal video: ${videoRes.status}`);
  return videoRes.blob();
}

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

    mapSettings(input, config, settings);

    // Handle image input for I2V
    if (imageBase64) {
      const imageUrl = uploadImageToFal(imageBase64);
      const imageKey = mapping.imageInput ?? "image_url";
      input[imageKey] = imageUrl;
    }

    return submitAndDownload(endpointId, input, apiKey);
  },

  async generateVideoRequest(
    config: VideoModelConfig,
    request: VideoGenerationRequest,
    apiKey: string
  ): Promise<Blob> {
    const input: Record<string, unknown> = {
      prompt: request.prompt,
      ...(config.fixedParams ?? {}),
    };
    mapSettings(input, config, request.settings);

    if (request.mode === "image-to-video") {
      const mode = config.generationModes?.imageToVideo;
      const opts = (config.transportOptions ?? {}) as Record<string, string>;
      // Models like Veo 3.1 split start-only and start+end across two fal
      // endpoints with different param names; endFrameEndpoint carries the
      // start+end variant so the end frame stays optional for the user.
      const endFrame = request.endImage ? mode?.endFrameEndpoint : undefined;
      const endpoint =
        endFrame?.endpoint ?? mode?.endpoint ?? opts.imageToVideoEndpoint ?? config.models.imageToVideo;
      if (!endpoint) throw new Error(`${config.name} does not support image-to-video`);
      if (request.startImage) {
        const imageKey = endFrame?.imageInput ?? config.paramMapping?.imageInput ?? "image_url";
        input[imageKey] = uploadImageToFal(request.startImage);
      }
      if (request.endImage) {
        const endKey =
          endFrame?.endImageInput ?? config.paramMapping?.endImageInput ?? "end_image_url";
        input[endKey] = uploadImageToFal(request.endImage);
      }
      return submitAndDownload(endpoint, input, apiKey);
    }

    const mode = config.generationModes?.textToVideo;
    const opts = (config.transportOptions ?? {}) as Record<string, string>;
    const endpoint = mode?.endpoint ?? opts.textToVideoEndpoint ?? config.models.textToVideo;
    if (!endpoint) throw new Error(`${config.name} does not support text-to-video`);
    return submitAndDownload(endpoint, input, apiKey);
  },
};
