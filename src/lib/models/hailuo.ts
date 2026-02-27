import { VideoModelProvider, blobToBase64 } from "./types";
import { generateKieVideoBlob } from "./kie-shared";

export const hailuoProvider: VideoModelProvider = {
  id: "hailuo-2.3",
  name: "Hailuo 2.3 Pro",
  description: "MiniMax's high-fidelity 6s video model via kie.ai",
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
      // Hailuo i2v uses singular image_url string, not an array
      const input: Record<string, unknown> = { prompt };
      return generateKieVideoBlob(
        "hailuo/2-3-image-to-video-pro",
        input,
        imageBase64,
        apiKey,
        "image_url"
      );
    } else {
      const input: Record<string, unknown> = { prompt };
      return generateKieVideoBlob(
        "hailuo/02-text-to-video-pro",
        input,
        null,
        apiKey,
        "image_url"
      );
    }
  },
};
