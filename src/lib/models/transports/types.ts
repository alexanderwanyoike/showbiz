import type { GenerationObserver } from "../../../../shared/generation-output";
import type { VideoGenerationSettings } from "../types";
import type { VideoModelConfig, ImageModelConfig } from "../config-schema";
import type { ImageRequestOptions } from "../../../../shared/model-config";
import type { VideoGenerationRequest } from "../../generation/types";

export interface VideoTransport {
  generateVideo(
    config: VideoModelConfig,
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings: VideoGenerationSettings,
    observer?: GenerationObserver,
  ): Promise<Blob>;

  generateVideoRequest?(
    config: VideoModelConfig,
    request: VideoGenerationRequest,
    apiKey: string,
    observer?: GenerationObserver,
  ): Promise<Blob>;
}

export interface ImageTransport {
  generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions,
  ): Promise<string>;

  editImage?(
    config: ImageModelConfig,
    editPrompt: string,
    sourceImageBase64: string,
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions,
  ): Promise<string>;

  // Generate a single image from a prompt plus one or more reference images
  // (multi-image composition: e.g. a character + a location + a style).
  composeImage?(
    config: ImageModelConfig,
    prompt: string,
    referenceImages: string[],
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions,
  ): Promise<string>;
}
