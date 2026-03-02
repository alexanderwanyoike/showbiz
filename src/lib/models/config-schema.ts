import type { VideoModelCapabilities, VideoGenerationSettings } from "./types";
import { VALID_VIDEO_TRANSPORTS, VALID_IMAGE_TRANSPORTS } from "./transports";

export interface VideoModelConfig {
  id: string;
  name: string;
  description: string;
  transport: string;
  transportOptions?: Record<string, unknown>;
  enabled: boolean;
  apiKeyProvider: string;
  models: {
    textToVideo?: string;
    imageToVideo?: string;
  };
  paramMapping?: {
    duration?: string;
    resolution?: string;
    aspectRatio?: string;
    audio?: string;
    imageInput?: string;
    imageFormat?: "array" | "string";
  };
  fixedParams?: Record<string, unknown>;
  capabilities: VideoModelCapabilities;
  defaults: VideoGenerationSettings;
}

export interface ImageModelConfig {
  id: string;
  name: string;
  description: string;
  transport: string;
  transportOptions?: Record<string, unknown>;
  enabled: boolean;
  apiKeyProvider: string;
  models: {
    generate: string;
    edit?: string;
  };
  supportsEditing: boolean;
  supportsInpainting: boolean;
  paramMapping?: Record<string, string>;
  fixedParams?: Record<string, unknown>;
}

export function validateVideoConfig(raw: unknown): VideoModelConfig {
  const config = raw as Record<string, unknown>;

  if (!config || typeof config !== "object") {
    throw new Error("Video config must be a JSON object");
  }

  const required = ["id", "name", "description", "transport", "enabled", "apiKeyProvider", "models", "capabilities", "defaults"] as const;
  for (const field of required) {
    if (config[field] === undefined) {
      throw new Error(`Video config "${config.id ?? "unknown"}": missing required field "${field}"`);
    }
  }

  if (typeof config.id !== "string" || !config.id) {
    throw new Error(`Video config: "id" must be a non-empty string`);
  }

  if (!VALID_VIDEO_TRANSPORTS.includes(config.transport as string)) {
    throw new Error(
      `Video config "${config.id}": unknown transport "${config.transport}". Valid: ${VALID_VIDEO_TRANSPORTS.join(", ")}`
    );
  }

  const models = config.models as Record<string, unknown>;
  if (!models.textToVideo && !models.imageToVideo) {
    throw new Error(
      `Video config "${config.id}": must have at least one of models.textToVideo or models.imageToVideo`
    );
  }

  const capabilities = config.capabilities as Record<string, unknown>;
  if (!Array.isArray(capabilities.durations) || capabilities.durations.length === 0) {
    throw new Error(`Video config "${config.id}": capabilities.durations must be a non-empty array`);
  }

  const defaults = config.defaults as Record<string, unknown>;
  if (!defaults.duration) {
    throw new Error(`Video config "${config.id}": defaults.duration is required`);
  }

  return config as unknown as VideoModelConfig;
}

export function validateImageConfig(raw: unknown): ImageModelConfig {
  const config = raw as Record<string, unknown>;

  if (!config || typeof config !== "object") {
    throw new Error("Image config must be a JSON object");
  }

  const required = ["id", "name", "description", "transport", "enabled", "apiKeyProvider", "models", "supportsEditing", "supportsInpainting"] as const;
  for (const field of required) {
    if (config[field] === undefined) {
      throw new Error(`Image config "${config.id ?? "unknown"}": missing required field "${field}"`);
    }
  }

  if (typeof config.id !== "string" || !config.id) {
    throw new Error(`Image config: "id" must be a non-empty string`);
  }

  if (!VALID_IMAGE_TRANSPORTS.includes(config.transport as string)) {
    throw new Error(
      `Image config "${config.id}": unknown transport "${config.transport}". Valid: ${VALID_IMAGE_TRANSPORTS.join(", ")}`
    );
  }

  const models = config.models as Record<string, unknown>;
  if (!models.generate) {
    throw new Error(`Image config "${config.id}": models.generate is required`);
  }

  return config as unknown as ImageModelConfig;
}
