import { VideoModelProvider, blobToBase64 } from "./types";
import { generateKieVideoBlob } from "./kie-shared";

export const seedanceProvider: VideoModelProvider = {
  id: "seedance-2",
  name: "Seedance 2.0",
  description: "ByteDance's cinematic video model — 4–15s via kie.ai",
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
    if (imageBase64) {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: "16:9",
        duration: "8",
      };
      return generateKieVideoBlob(
        "bytedance/seedance-2-image-to-video",
        input,
        imageBase64,
        apiKey,
        "input_urls"
      );
    } else {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: "16:9",
        duration: "8",
      };
      return generateKieVideoBlob(
        "bytedance/seedance-2-text-to-video",
        input,
        null,
        apiKey,
        "input_urls"
      );
    }
  },
};
