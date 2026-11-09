import { fetch } from "../http";
import { parseGoogleApiError } from "../types";
import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";
import type { ImageRequestOptions } from "../../../../shared/model-config";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function extractImageFromGenerateContent(data: Record<string, unknown>, modelName: string): string {
  const candidates = data.candidates as Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }> | undefined;
  const parts = candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || "image/png";
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error(`No image data found in ${modelName} response`);
}

async function predictGenerate(
  config: ImageModelConfig,
  prompt: string,
  apiKey: string
): Promise<string> {
  const modelId = config.models.generate;
  const url = `${BASE_URL}/models/${modelId}:predict?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, ...(config.fixedParams ?? {}) },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(parseGoogleApiError(errorText, response.status));
  }

  const data = await response.json();
  const base64Image = (data as Record<string, unknown[]>).predictions?.[0] as
    Record<string, string> | undefined;

  if (base64Image?.bytesBase64Encoded) {
    return `data:image/png;base64,${base64Image.bytesBase64Encoded}`;
  }

  throw new Error(`No image data found in ${config.name} response`);
}

const generationConfig = (options?: ImageRequestOptions) => ({
  responseModalities: ["IMAGE", "TEXT"],
  ...(options?.aspectRatio ? { imageConfig: { aspectRatio: options.aspectRatio } } : {}),
});

async function generateContentGenerate(
  config: ImageModelConfig,
  prompt: string,
  apiKey: string,
  options?: ImageRequestOptions
): Promise<string> {
  const modelId = config.models.generate;
  const url = `${BASE_URL}/models/${modelId}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: generationConfig(options),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(parseGoogleApiError(errorText, response.status));
  }

  const data = await response.json();
  return extractImageFromGenerateContent(data as Record<string, unknown>, config.name);
}

function toInlineDataPart(dataUrl: string): { inline_data: { mime_type: string; data: string } } {
  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid reference image data URL format");
  }
  return { inline_data: { mime_type: matches[1], data: matches[2] } };
}

// Generate an image from a prompt plus one or more reference images. Drives both
// single-image edit and multi-image composition (a character + a location + a style).
async function generateContentCompose(
  config: ImageModelConfig,
  prompt: string,
  referenceImages: string[],
  apiKey: string,
  options?: ImageRequestOptions
): Promise<string> {
  const modelId = config.models.edit ?? config.models.generate;
  const url = `${BASE_URL}/models/${modelId}:generateContent`;

  const imageParts = referenceImages.map(toInlineDataPart);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, ...imageParts] }],
      generationConfig: generationConfig(options),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(parseGoogleApiError(errorText, response.status));
  }

  const data = await response.json();
  return extractImageFromGenerateContent(data as Record<string, unknown>, config.name);
}

export const googleImageTransport: ImageTransport = {
  async generateImage(config, prompt, apiKey, _observer, options) {
    const apiPattern = config.transportOptions?.apiPattern as string | undefined;
    if (apiPattern === "predict") {
      return predictGenerate(config, prompt, apiKey);
    }
    return generateContentGenerate(config, prompt, apiKey, options);
  },

  async editImage(config, editPrompt, sourceImageBase64, apiKey, _observer, options) {
    const apiPattern = config.transportOptions?.apiPattern as string | undefined;
    if (apiPattern === "predict") {
      throw new Error(`${config.name} does not support image editing.`);
    }
    return generateContentCompose(config, editPrompt, [sourceImageBase64], apiKey, options);
  },

  async composeImage(config, prompt, referenceImages, apiKey, _observer, options) {
    const apiPattern = config.transportOptions?.apiPattern as string | undefined;
    if (apiPattern === "predict") {
      throw new Error(`${config.name} does not support multi-reference composition.`);
    }
    if (referenceImages.length === 0) {
      throw new Error("composeImage requires at least one reference image");
    }
    return generateContentCompose(config, prompt, referenceImages, apiKey, options);
  },
};
