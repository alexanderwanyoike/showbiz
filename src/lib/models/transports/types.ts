import type { VideoGenerationSettings } from "../types";
import type { VideoModelConfig, ImageModelConfig } from "../config-schema";

export interface VideoTransport {
  generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings: VideoGenerationSettings
  ): Promise<Blob>;
}

export interface ImageTransport {
  generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string
  ): Promise<string>;

  editImage?(
    config: ImageModelConfig,
    editPrompt: string,
    sourceImageBase64: string,
    apiKey: string
  ): Promise<string>;
}
