import { VideoModelProvider, blobToBase64 } from "./types";
import { generateKieVideoBlob } from "./kie-shared";

// Model IDs confirmed: https://kie.ai/seedance-2-0
// Parameter schema mirrors Seedance 1.5 Pro: https://docs.kie.ai/market/bytedance/seedance-1.5-pro
// input_urls triggers image-to-video; omitting it = text-to-video

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
    const model = imageBase64
      ? "bytedance/seedance-2-image-to-video"
      : "bytedance/seedance-2-text-to-video";

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: "8",
      fixed_lens: false,
      generate_audio: false,
    };

    return generateKieVideoBlob(model, input, imageBase64, apiKey, "input_urls");
  },
};
