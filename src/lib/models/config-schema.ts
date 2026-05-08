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
  provider?: string;
  modelFamily?: string;
  models: {
    textToVideo?: string;
    imageToVideo?: string;
  };
  generationModes?: {
    textToVideo?: {
      endpoint: string;
    };
    imageToVideo?: {
      endpoint: string;
      inputs?: {
        startImage?: boolean;
        endImage?: boolean;
      };
    };
    referenceToVideo?: {
      endpoint: string;
      inputs?: {
        imageReferences?: { max: number };
      };
      promptSyntax?: string;
    };
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
  provider?: string;
  modelFamily?: string;
  models: {
    generate: string;
    edit?: string;
  };
  generationModes?: {
    textToImage?: {
      enabled: boolean;
      endpoint?: string;
    };
    imageToImage?: {
      enabled: boolean;
      endpoint?: string;
      imageInput?: string;
    };
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

  // Validate provider/modelFamily
  if (config.modelFamily && !config.provider) {
    throw new Error(`Video config "${config.id}": "modelFamily" requires "provider" to be set`);
  }
  if (config.provider !== undefined && (typeof config.provider !== "string" || !config.provider)) {
    throw new Error(`Video config "${config.id}": "provider" must be a non-empty string`);
  }

  const models = config.models as Record<string, unknown>;
  if (!models.textToVideo && !models.imageToVideo) {
    throw new Error(
      `Video config "${config.id}": must have at least one of models.textToVideo or models.imageToVideo`
    );
  }

  if (config.generationModes !== undefined) {
    const modes = config.generationModes as Record<string, unknown>;
    const referenceMode = modes.referenceToVideo as Record<string, unknown> | undefined;
    if (referenceMode) {
      if (typeof referenceMode.endpoint !== "string" || !referenceMode.endpoint) {
        throw new Error(`Video config "${config.id}": referenceToVideo.endpoint is required`);
      }
      const inputs = referenceMode.inputs as Record<string, unknown> | undefined;
      const imageReferences = inputs?.imageReferences as Record<string, unknown> | undefined;
      if (imageReferences) {
        const max = imageReferences.max;
        if (typeof max !== "number" || max <= 0) {
          throw new Error(`Video config "${config.id}": imageReferences.max must be greater than 0`);
        }
      }
    }
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

  // Validate provider/modelFamily
  if (config.modelFamily && !config.provider) {
    throw new Error(`Image config "${config.id}": "modelFamily" requires "provider" to be set`);
  }
  if (config.provider !== undefined && (typeof config.provider !== "string" || !config.provider)) {
    throw new Error(`Image config "${config.id}": "provider" must be a non-empty string`);
  }

  const models = config.models as Record<string, unknown>;
  if (!models.generate) {
    throw new Error(`Image config "${config.id}": models.generate is required`);
  }

  if (config.generationModes !== undefined) {
    const modes = config.generationModes as Record<string, unknown>;
    for (const [modeName, mode] of Object.entries(modes)) {
      const modeConfig = mode as Record<string, unknown>;
      if (typeof modeConfig.enabled !== "boolean") {
        throw new Error(`Image config "${config.id}": ${modeName}.enabled must be boolean`);
      }
    }
  }

  return config as unknown as ImageModelConfig;
}
