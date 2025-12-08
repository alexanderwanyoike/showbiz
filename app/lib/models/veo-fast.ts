import { VideoModelProvider, blobToBase64 } from "./types";
import { generateVeoVideoBlob } from "./veo-shared";

const VEO_FAST_MODEL = "veo-3.1-fast-generate-preview";

export const veoFastProvider: VideoModelProvider = {
  id: "veo3-fast",
  name: "Veo 3.1 Fast",
  description: "Google's fast video generation model with audio ($0.15/sec)",
  apiKeyProvider: "gemini",
  supportsImageToVideo: true,
  supportsTextToVideo: true,

  async generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<string> {
    const videoBlob = await generateVeoVideoBlob(prompt, imageBase64, apiKey, {
      modelId: VEO_FAST_MODEL,
      modelName: "Veo 3.1 Fast",
      // Fast model: start polling quickly
      initialPollInterval: 3000,
      maxPollInterval: 8000,
    });
    return blobToBase64(videoBlob);
  },

  async generateVideoBlob(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<Blob> {
    return generateVeoVideoBlob(prompt, imageBase64, apiKey, {
      modelId: VEO_FAST_MODEL,
      modelName: "Veo 3.1 Fast",
      // Fast model: start polling quickly
      initialPollInterval: 3000,
      maxPollInterval: 8000,
    });
  },
};
