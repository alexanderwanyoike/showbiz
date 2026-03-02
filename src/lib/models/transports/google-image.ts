import { fetch } from "../http";
import { parseGoogleApiError } from "../types";
import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";

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

async function generateContentGenerate(
  config: ImageModelConfig,
  prompt: string,
  apiKey: string
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
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(parseGoogleApiError(errorText, response.status));
  }

  const data = await response.json();
  return extractImageFromGenerateContent(data as Record<string, unknown>, config.name);
}

async function generateContentEdit(
  config: ImageModelConfig,
  editPrompt: string,
  sourceImageBase64: string,
  apiKey: string
): Promise<string> {
  const modelId = config.models.edit ?? config.models.generate;
  const url = `${BASE_URL}/models/${modelId}:generateContent`;

  const matches = sourceImageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid source image data URL format");
  }
  const mimeType = matches[1];
  const imageData = matches[2];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: editPrompt },
            { inline_data: { mime_type: mimeType, data: imageData } },
          ],
        },
      ],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
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
  async generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string
  ): Promise<string> {
    const apiPattern = config.transportOptions?.apiPattern as string | undefined;
    if (apiPattern === "predict") {
      return predictGenerate(config, prompt, apiKey);
    }
    return generateContentGenerate(config, prompt, apiKey);
  },

  async editImage(
    config: ImageModelConfig,
    editPrompt: string,
    sourceImageBase64: string,
    apiKey: string
  ): Promise<string> {
    const apiPattern = config.transportOptions?.apiPattern as string | undefined;
    if (apiPattern === "predict") {
      throw new Error(`${config.name} does not support image editing.`);
    }
    return generateContentEdit(config, editPrompt, sourceImageBase64, apiKey);
  },
};
