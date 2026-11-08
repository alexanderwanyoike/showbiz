import type { GenerationObserver } from "../../../shared/generation-output";
import type { ImageRequestOptions } from "../../../shared/model-config";
import type { VideoGenerationRequest } from "../generation/types";
import type { ApiKeyProvider } from "../../../shared/provider-catalog";

export type ImageModelId = string;
export type VideoModelId = string;

import type { VideoModelCapabilities, VideoGenerationSettings } from "../../../shared/model-config";
export type { VideoModelCapabilities, VideoGenerationSettings } from "../../../shared/model-config";

export interface VideoModelModeCapabilities {
  textToVideo?: {
    endpoint: string;
  };
  imageToVideo?: {
    endpoint: string;
    supportsStartImage?: boolean;
    supportsEndImage?: boolean;
    /** The endpoint cannot run without an end frame (e.g. WAN FLF2V). */
    requiresEndImage?: boolean;
  };
}

export interface ImageModelModeCapabilities {
  textToImage?: {
    enabled: boolean;
    endpoint?: string;
  };
  imageToImage?: {
    enabled: boolean;
    endpoint?: string;
    imageInput?: string;
  };
}

export interface ImageModelProvider {
  modeCapabilities?: ImageModelModeCapabilities;
  id: ImageModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: ApiKeyProvider;
  /** Shapes this model can be asked for; a frame needs FRAME_ASPECT_RATIO among them. */
  aspectRatios: string[];
  generateImage(
    prompt: string,
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions
  ): Promise<string>;
  supportsImageEditing?: boolean;
  supportsInpainting?: boolean;
  editImage?(
    prompt: string,
    sourceImageBase64: string,
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions
  ): Promise<string>;
  inpaintImage?(
    prompt: string,
    sourceImageBase64: string,
    maskBase64: string,
    apiKey: string,
    observer?: GenerationObserver
  ): Promise<string>;
  supportsComposition?: boolean;
  composeImage?(
    prompt: string,
    referenceImages: string[],
    apiKey: string,
    observer?: GenerationObserver,
    options?: ImageRequestOptions
  ): Promise<string>;
}

export interface VideoModelProvider {
  id: VideoModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: ApiKeyProvider;
  capabilities: VideoModelCapabilities;
  modeCapabilities: VideoModelModeCapabilities;
  defaults: VideoGenerationSettings;
  supportsImageToVideo: boolean;
  supportsTextToVideo: boolean;
  generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings?: VideoGenerationSettings,
    observer?: GenerationObserver
  ): Promise<string>;
  generateVideoBlob?(
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings?: VideoGenerationSettings,
    observer?: GenerationObserver
  ): Promise<Blob>;
  generateVideoFromRequest?(
    request: VideoGenerationRequest,
    apiKey: string,
    observer?: GenerationObserver
  ): Promise<Blob>;
}

export interface ImageModelInfo {
  id: ImageModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: ApiKeyProvider;
  provider?: string;
  supportsImageEditing?: boolean;
  supportsInpainting?: boolean;
  modeCapabilities?: ImageModelModeCapabilities;
}

export interface VideoModelInfo {
  id: VideoModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: ApiKeyProvider;
  provider?: string;
  capabilities: VideoModelCapabilities;
  modeCapabilities: VideoModelModeCapabilities;
  defaults: VideoGenerationSettings;
  supportsImageToVideo: boolean;
  supportsTextToVideo: boolean;
}

// Helper to parse Google API errors
export function parseGoogleApiError(errorText: string, statusCode?: number): string {
  try {
    const errorJson = JSON.parse(errorText);
    const message = errorJson.error?.message || "";
    const status = errorJson.error?.status || "";

    if (statusCode === 429 || status === "RESOURCE_EXHAUSTED") {
      return "You've exceeded your API quota. Please check your Google AI billing and rate limits.";
    }

    if (message.includes("celebrity") || message.includes("real people")) {
      return "Content blocked: Google doesn't allow generating videos with real people's names or likenesses. Please remove any celebrity references.";
    }

    if (message.includes("safety") || message.includes("blocked")) {
      return "Content blocked: Your prompt was flagged by Google's safety filters. Please try a different prompt.";
    }

    if (message) {
      return message;
    }
  } catch {
    // Not JSON, continue with string matching
  }

  if (errorText.includes("quota") || errorText.includes("429")) {
    return "You've exceeded your API quota. Please check your Google AI billing and rate limits.";
  }

  if (errorText.includes("celebrity") || errorText.includes("real people")) {
    return "Content blocked: Google doesn't allow generating videos with real people's names or likenesses.";
  }

  return errorText;
}

// Helper to convert blob to base64 data URL (browser-compatible)
export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${blob.type};base64,${base64}`;
}
