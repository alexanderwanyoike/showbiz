export type ImageModelId = "imagen4" | "nano-banana" | "nano-banana-pro" | "flux-kontext" | "seedream-4.5";
export type VideoModelId =
  | "veo3" | "veo3-fast" | "ltx-video"
  | "kling-3" | "kling-2.6" | "seedance-2" | "seedance-1.5"
  | "hailuo-2.3" | "wan-2.6" | "sora-2-pro" | "grok-imagine";

export interface VideoModelCapabilities {
  durations: string[];
  resolutions?: string[];
  aspectRatios?: string[];
  hasAudio?: boolean;
}

export interface VideoGenerationSettings {
  duration: string;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
}

export interface ImageModelProvider {
  id: ImageModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: "gemini" | "ltx" | "kie";
  generateImage(prompt: string, apiKey: string): Promise<string>;
  supportsImageEditing?: boolean;
  supportsInpainting?: boolean;
  editImage?(
    prompt: string,
    sourceImageBase64: string,
    apiKey: string
  ): Promise<string>;
  inpaintImage?(
    prompt: string,
    sourceImageBase64: string,
    maskBase64: string,
    apiKey: string
  ): Promise<string>;
}

export interface VideoModelProvider {
  id: VideoModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: "gemini" | "ltx" | "kie";
  capabilities: VideoModelCapabilities;
  defaults: VideoGenerationSettings;
  supportsImageToVideo: boolean;
  supportsTextToVideo: boolean;
  generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings?: VideoGenerationSettings
  ): Promise<string>;
  generateVideoBlob?(
    prompt: string,
    imageBase64: string | null,
    apiKey: string,
    settings?: VideoGenerationSettings
  ): Promise<Blob>;
}

export interface ImageModelInfo {
  id: ImageModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: "gemini" | "ltx" | "kie";
  supportsImageEditing?: boolean;
  supportsInpainting?: boolean;
}

export interface VideoModelInfo {
  id: VideoModelId;
  name: string;
  description: string;
  enabled: boolean;
  apiKeyProvider: "gemini" | "ltx" | "kie";
  capabilities: VideoModelCapabilities;
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
