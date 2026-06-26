import type { VideoGenerationSettings, VideoModelModeCapabilities } from "../models/types";

export type BibleAssetType = "character" | "location" | "prop" | "style" | "reference" | "note";
export type GenerationReferenceKind = Exclude<BibleAssetType, "note">;
export type GenerationMediaType = "image" | "video" | "audio";
export type VideoGenerationMode = "text-to-video" | "image-to-video" | "reference-to-video";

export interface GenerationReference {
  id: string;
  assetId: string;
  kind: GenerationReferenceKind;
  mediaType: GenerationMediaType;
  label: string;
  data: string;
  description?: string | null;
  rules?: string | null;
  variantPrompt?: string | null;
  promptAlias?: string;
}

export type { VideoModelModeCapabilities };

export interface VideoGenerationRequest {
  mode: VideoGenerationMode;
  prompt: string;
  settings: VideoGenerationSettings;
  startImage?: string | null;
  endImage?: string | null;
  references?: GenerationReference[];
}

export interface ShotPromptInput {
  action: string;
  camera?: string | null;
  mood?: string | null;
  references: GenerationReference[];
  includeAliases?: boolean;
  promptOverride?: string | null;
}

export interface CompiledShotPrompt {
  prompt: string;
  references: GenerationReference[];
}
