import { fetch } from "../http";
import type { VideoTransport } from "./types";
import type { VideoModelConfig } from "../config-schema";
import type { VideoGenerationSettings } from "../types";

export const ltxTransport: VideoTransport = {
  async generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings: VideoGenerationSettings
  ): Promise<Blob> {
    const opts = config.transportOptions ?? {};
    const baseUrl = (opts.baseUrl as string) ?? "https://api.ltx.video/v1";
    const endpoint = imageBase64 ? "image-to-video" : "text-to-video";
    const url = `${baseUrl}/${endpoint}`;

    const modelId = config.models.imageToVideo ?? config.models.textToVideo!;

    interface LtxRequestBody {
      prompt: string;
      model: string;
      duration: number;
      resolution: string;
      image_uri?: string;
    }

    const body: LtxRequestBody = {
      prompt,
      model: modelId,
      duration: parseInt(settings.duration, 10),
      resolution: settings.resolution ?? "1920x1080",
    };

    if (imageBase64) {
      body.image_uri = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }

      if (response.status === 401) throw new Error("LTX API key is invalid or expired");
      if (response.status === 429) throw new Error("LTX API rate limit exceeded. Please try again later.");
      if (response.status === 402) throw new Error("LTX API credits exhausted. Please add more credits.");
      throw new Error(`LTX Video generation failed: ${errorMessage}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("video/mp4")) {
      return await response.blob();
    }

    const data = await response.json();

    if ((data as Record<string, unknown>).video_url) {
      const videoResponse = await fetch((data as Record<string, string>).video_url);
      if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
      return await videoResponse.blob();
    }

    if ((data as Record<string, unknown>).video_base64) {
      const binary = atob((data as Record<string, string>).video_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: "video/mp4" });
    }

    throw new Error("Unexpected response format from LTX Video API");
  },
};
