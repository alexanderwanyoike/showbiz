import type { VideoGenerationSettings, VideoModelModeCapabilities } from "../models/types";

export type VideoGenerationMode = "text-to-video" | "image-to-video";

export type { VideoModelModeCapabilities };

export interface VideoGenerationRequest {
  mode: VideoGenerationMode;
  prompt: string;
  settings: VideoGenerationSettings;
  startImage?: string | null;
  endImage?: string | null;
}
