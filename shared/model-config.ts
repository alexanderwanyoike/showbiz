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

import {
  VALID_VIDEO_TRANSPORTS,
  VALID_IMAGE_TRANSPORTS,
  SHAPED_IMAGE_TRANSPORTS,
  FAL_SHAPE_PARAMS,
} from "./model-transports";
import { isApiKeyProvider, type ApiKeyProvider } from "./provider-catalog";

export interface VideoModelConfig {
  id: string;
  name: string;
  description: string;
  transport: string;
  transportOptions?: Record<string, unknown>;
  enabled: boolean;
  apiKeyProvider: ApiKeyProvider;
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
        /** "required" = the endpoint rejects requests without an end frame (e.g. WAN FLF2V). */
        endImage?: boolean | "required";
      };
      /**
       * Separate endpoint used only when the request carries an end frame
       * (e.g. Veo 3.1 first-last-frame-to-video), with its own image param
       * names. The base endpoint then handles start-frame-only requests.
       */
      endFrameEndpoint?: {
        endpoint: string;
        imageInput?: string;
        endImageInput?: string;
      };
    };
  };
  paramMapping?: {
    duration?: string;
    resolution?: string;
    aspectRatio?: string;
    audio?: string;
    imageInput?: string;
    endImageInput?: string;
    imageFormat?: "array" | "string";
  };
  // Send `duration` as a number (some fal models require an integer enum, e.g. LTX-2.3).
  numericDuration?: boolean;
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
  apiKeyProvider: ApiKeyProvider;
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
      imageFormat?: "array" | "string";
    };
  };
  supportsEditing: boolean;
  supportsInpainting: boolean;
  // Multi-reference composition (compose a frame from several images). Distinct
  // from editing a single image; gates whether composeImage is exposed.
  supportsComposition?: boolean;
  /** Shapes Showbiz can ask this model for, such as "16:9"; without one the provider picks. */
  aspectRatios?: string[];
  paramMapping?: Record<string, string>;
  fixedParams?: Record<string, unknown>;
}

/** Frames and shot start frames belong to a 16:9 video. */
export const FRAME_ASPECT_RATIO = "16:9" as const;
export interface ImageRequestOptions {
  aspectRatio?: string;
}
export const FRAME_SHAPE: Readonly<ImageRequestOptions> = Object.freeze({ aspectRatio: FRAME_ASPECT_RATIO });

/** Why a model cannot be asked for the requested shape, or null when it can. */
export function shapeRefusal(
  model: { name: string; aspectRatios?: readonly string[] },
  options?: ImageRequestOptions,
): string | null {
  const ratio = options?.aspectRatio;
  return ratio && !model.aspectRatios?.includes(ratio)
    ? `${model.name} cannot make ${ratio} pictures, which frames and shots need.`
    : null;
}

function validateMetadata(
  config: Record<string, unknown>,
  kind: "Image" | "Video",
) {
  for (const field of ["name", "description"] as const) {
    if (
      typeof config[field] !== "string" ||
      (field === "name" && !config[field])
    )
      throw new Error(
        `${kind} config "${String(config.id)}": "${field}" must be ${field === "name" ? "a non-empty string" : "a string"}`,
      );
  }
  if (typeof config.enabled !== "boolean")
    throw new Error(
      `${kind} config "${String(config.id)}": "enabled" must be boolean`,
    );
  for (const field of [
    "supportsEditing",
    "supportsInpainting",
    "supportsComposition",
  ] as const) {
    if (config[field] !== undefined && typeof config[field] !== "boolean")
      throw new Error(
        `${kind} config "${String(config.id)}": "${field}" must be boolean`,
      );
  }
}

export function validateVideoConfig(raw: unknown): VideoModelConfig {
  const config = raw as Record<string, unknown>;

  if (!config || typeof config !== "object") {
    throw new Error("Video config must be a JSON object");
  }

  const required = [
    "id",
    "name",
    "description",
    "transport",
    "enabled",
    "apiKeyProvider",
    "models",
    "capabilities",
    "defaults",
  ] as const;
  for (const field of required) {
    if (config[field] === undefined) {
      throw new Error(
        `Video config "${config.id ?? "unknown"}": missing required field "${field}"`,
      );
    }
  }

  validateMetadata(config, "Video");

  if (typeof config.id !== "string" || !config.id) {
    throw new Error(`Video config: "id" must be a non-empty string`);
  }

  if (
    !VALID_VIDEO_TRANSPORTS.some((transport) => transport === config.transport)
  ) {
    throw new Error(
      `Video config "${config.id}": unknown transport "${config.transport}". Valid: ${VALID_VIDEO_TRANSPORTS.join(", ")}`,
    );
  }

  if (
    typeof config.apiKeyProvider !== "string" ||
    !isApiKeyProvider(config.apiKeyProvider)
  ) {
    throw new Error(
      `Video config "${config.id}": unknown API key provider "${String(config.apiKeyProvider)}"`,
    );
  }

  // Validate provider/modelFamily
  if (config.modelFamily && !config.provider) {
    throw new Error(
      `Video config "${config.id}": "modelFamily" requires "provider" to be set`,
    );
  }
  if (
    config.provider !== undefined &&
    (typeof config.provider !== "string" || !config.provider)
  ) {
    throw new Error(
      `Video config "${config.id}": "provider" must be a non-empty string`,
    );
  }

  const models = config.models as Record<string, unknown>;
  if (!models.textToVideo && !models.imageToVideo) {
    throw new Error(
      `Video config "${config.id}": must have at least one of models.textToVideo or models.imageToVideo`,
    );
  }

  const capabilities = config.capabilities as Record<string, unknown>;
  if (
    !Array.isArray(capabilities.durations) ||
    capabilities.durations.length === 0
  ) {
    throw new Error(
      `Video config "${config.id}": capabilities.durations must be a non-empty array`,
    );
  }

  const defaults = config.defaults as Record<string, unknown>;
  if (!defaults.duration) {
    throw new Error(
      `Video config "${config.id}": defaults.duration is required`,
    );
  }

  return config as unknown as VideoModelConfig;
}

export function validateImageConfig(raw: unknown): ImageModelConfig {
  const config = raw as Record<string, unknown>;

  if (!config || typeof config !== "object") {
    throw new Error("Image config must be a JSON object");
  }

  const required = [
    "id",
    "name",
    "description",
    "transport",
    "enabled",
    "apiKeyProvider",
    "models",
    "supportsEditing",
    "supportsInpainting",
  ] as const;
  for (const field of required) {
    if (config[field] === undefined) {
      throw new Error(
        `Image config "${config.id ?? "unknown"}": missing required field "${field}"`,
      );
    }
  }

  validateMetadata(config, "Image");

  if (typeof config.id !== "string" || !config.id) {
    throw new Error(`Image config: "id" must be a non-empty string`);
  }

  if (
    !VALID_IMAGE_TRANSPORTS.some((transport) => transport === config.transport)
  ) {
    throw new Error(
      `Image config "${config.id}": unknown transport "${config.transport}". Valid: ${VALID_IMAGE_TRANSPORTS.join(", ")}`,
    );
  }

  if (
    typeof config.apiKeyProvider !== "string" ||
    !isApiKeyProvider(config.apiKeyProvider)
  ) {
    throw new Error(
      `Image config "${config.id}": unknown API key provider "${String(config.apiKeyProvider)}"`,
    );
  }

  // Validate provider/modelFamily
  if (config.modelFamily && !config.provider) {
    throw new Error(
      `Image config "${config.id}": "modelFamily" requires "provider" to be set`,
    );
  }
  if (
    config.provider !== undefined &&
    (typeof config.provider !== "string" || !config.provider)
  ) {
    throw new Error(
      `Image config "${config.id}": "provider" must be a non-empty string`,
    );
  }

  const models = config.models as Record<string, unknown>;
  if (!models.generate) {
    throw new Error(`Image config "${config.id}": models.generate is required`);
  }

  if (
    config.aspectRatios !== undefined &&
    (!Array.isArray(config.aspectRatios) ||
      !config.aspectRatios.every((ratio) => typeof ratio === "string" && /^\d+:\d+$/.test(ratio)))
  ) {
    throw new Error(
      `Image config "${config.id}": "aspectRatios" must be a list of ratios such as "16:9"`,
    );
  }
  if (config.aspectRatios !== undefined) {
    if (!SHAPED_IMAGE_TRANSPORTS.some((transport) => transport === config.transport))
      throw new Error(
        `Image config "${config.id}": "aspectRatios" is not supported by the ${String(config.transport)} transport, which cannot send a shape`,
      );
    const options = config.transportOptions as Record<string, unknown> | undefined;
    if (config.transport === "fal-image" && !FAL_SHAPE_PARAMS.includes(String(options?.aspectRatioParam)))
      throw new Error(
        `Image config "${config.id}": fal models with "aspectRatios" need transportOptions.aspectRatioParam set to ${FAL_SHAPE_PARAMS.join(" or ")}`,
      );
  }

  if (config.generationModes !== undefined) {
    const modes = config.generationModes as Record<string, unknown>;
    for (const [modeName, mode] of Object.entries(modes)) {
      const modeConfig = mode as Record<string, unknown>;
      if (typeof modeConfig.enabled !== "boolean") {
        throw new Error(
          `Image config "${config.id}": ${modeName}.enabled must be boolean`,
        );
      }
    }
  }

  return config as unknown as ImageModelConfig;
}
