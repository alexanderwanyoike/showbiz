import { VideoModelProvider, blobToBase64 } from "./types";
import { generateVeoVideoBlob } from "./veo-shared";

const VEO_MODEL = "veo-3.0-generate-001";

export const veoProvider: VideoModelProvider = {
  id: "veo3",
  name: "Veo 3",
  description: "Google's high-quality video generation model with audio",
  apiKeyProvider: "gemini",
  supportsImageToVideo: true,
  supportsTextToVideo: true,

  async generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<string> {
    const videoBlob = await generateVeoVideoBlob(prompt, imageBase64, apiKey, {
      modelId: VEO_MODEL,
      modelName: "Veo 3",
      initialPollInterval: 5000,
      maxPollInterval: 10000,
    });
    return blobToBase64(videoBlob);
  },

  async generateVideoBlob(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<Blob> {
    return generateVeoVideoBlob(prompt, imageBase64, apiKey, {
      modelId: VEO_MODEL,
      modelName: "Veo 3",
      initialPollInterval: 5000,
      maxPollInterval: 10000,
    });
  },
};
