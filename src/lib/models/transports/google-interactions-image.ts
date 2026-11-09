import { fetch } from "../http";
import type { ImageRequestOptions } from "../../../../shared/model-config";
import { parseGoogleApiError } from "../types";
import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function toImagePart(dataUrl: string): { type: "image"; data: string; mime_type: string } {
  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid reference image data URL format");
  }
  return { type: "image", data: matches[2], mime_type: matches[1] };
}

// Gemini 3 image models "think": they emit intermediate images in `thought`
// steps before the final render in a `model_output` step. Skip thought steps and
// return the LAST model_output image (per the docs, that is the final image).
function extractImage(data: Record<string, unknown>, modelName: string): string {
  const steps = data.steps as
    | Array<{ type?: string; content?: Array<{ type?: string; data?: string; mime_type?: string }> }>
    | undefined;
  let finalImage: string | null = null;
  for (const step of steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "image" && content.data) {
        finalImage = `data:${content.mime_type || "image/png"};base64,${content.data}`;
      }
    }
  }
  if (finalImage) return finalImage;
  throw new Error(`No image data found in ${modelName} response`);
}

// Generate an image from a prompt plus zero or more reference images via the
// Gemini Interactions API. Drives text-to-image, single-image edit, and
// multi-image composition (a character + a location + a style).
async function runInteraction(
  config: ImageModelConfig,
  prompt: string,
  referenceImages: string[],
  apiKey: string,
  options?: ImageRequestOptions
): Promise<string> {
  const input: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  for (const reference of referenceImages) {
    input.push(toImagePart(reference));
  }

  const response = await fetch(`${BASE_URL}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    // response_format tells the Interactions API to return an image (the docs
    // include it for image generation; without it the model can fall back to a
    // mode that does not condition on the reference images).
    body: JSON.stringify({
      model: config.models.generate,
      input,
      response_format: {
        type: "image",
        ...(options?.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(parseGoogleApiError(await response.text(), response.status));
  }

  const data = await response.json();
  return extractImage(data as Record<string, unknown>, config.name);
}

export const googleInteractionsImageTransport: ImageTransport = {
  async generateImage(config, prompt, apiKey, _observer, options) {
    return runInteraction(config, prompt, [], apiKey, options);
  },

  async editImage(config, editPrompt, sourceImageBase64, apiKey, _observer, options) {
    return runInteraction(config, editPrompt, [sourceImageBase64], apiKey, options);
  },

  async composeImage(config, prompt, referenceImages, apiKey, _observer, options) {
    if (referenceImages.length === 0) {
      throw new Error("composeImage requires at least one reference image");
    }
    return runInteraction(config, prompt, referenceImages, apiKey, options);
  },
};
