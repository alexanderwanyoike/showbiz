import type { VideoGenerationSettings } from "../models/types";
import type {
  GenerationReference,
  VideoGenerationRequest,
  VideoModelModeCapabilities,
} from "./types";
import { chooseVideoGenerationMode, validateVideoGenerationRequest } from "./video-modes";

export interface BuildVideoRequestInput {
  capabilities: VideoModelModeCapabilities;
  prompt: string;
  settings: VideoGenerationSettings;
  startImage?: string | null;
  endImage?: string | null;
  references: GenerationReference[];
}

export function buildAutoVideoGenerationRequest(
  input: BuildVideoRequestInput
): VideoGenerationRequest {
  const mode = chooseVideoGenerationMode(input.capabilities, {
    hasStartImage: !!input.startImage,
    references: input.references,
  });
  const request: VideoGenerationRequest = {
    mode,
    prompt: input.prompt,
    settings: input.settings,
    startImage: input.startImage ?? null,
    endImage: input.endImage ?? null,
    references: input.references,
  };
  validateVideoGenerationRequest(input.capabilities, request);
  return request;
}
