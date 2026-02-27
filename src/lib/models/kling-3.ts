import { VideoModelProvider, blobToBase64 } from "./types";
import { generateKieVideoBlob } from "./kie-shared";

// Docs: https://docs.kie.ai/market/kling/kling-3.0
// image_urls = array of image URLs for image-to-video
// multi_shots = false for single-shot mode (must be explicitly set)

export const kling3Provider: VideoModelProvider = {
  id: "kling-3",
  name: "Kling 3.0",
  description: "Kuaishou's latest model — multi-shot, motion control, 3–15s via kie.ai",
  apiKeyProvider: "kie",
  supportsImageToVideo: true,
  supportsTextToVideo: true,

  async generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<string> {
    const blob = await this.generateVideoBlob!(prompt, imageBase64, apiKey);
    return blobToBase64(blob);
  },

  async generateVideoBlob(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<Blob> {
    const input: Record<string, unknown> = {
      prompt,
      sound: false,
      duration: "8",
      aspect_ratio: "16:9",
      mode: "std",
      multi_shots: false,
    };
    return generateKieVideoBlob("kling-3.0/video", input, imageBase64, apiKey, "image_urls");
  },
};
