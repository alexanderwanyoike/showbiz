import { fetch } from "../http";
import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";

const OPENAI_BASE = "https://api.openai.com/v1";

function parseOpenAiError(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    if (json.error?.message) return `OpenAI error (${status}): ${json.error.message}`;
  } catch {
    // not JSON, fall through
  }
  return `OpenAI error (${status}): ${text.slice(0, 200)}`;
}

function ensureDataUrl(image: string): string {
  return image.startsWith("data:") ? image : `data:image/png;base64,${image}`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

// Text-to-image via the Images API. Returns a base64 data URL.
async function generateViaImagesApi(
  config: ImageModelConfig,
  prompt: string,
  apiKey: string
): Promise<string> {
  const model = config.models.generate;
  const fixed = (config.fixedParams ?? {}) as Record<string, unknown>;

  const response = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model, prompt, n: 1, ...fixed }),
  });

  if (!response.ok) {
    throw new Error(parseOpenAiError(await response.text(), response.status));
  }

  const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image data found in ${config.name} response`);
  return `data:image/png;base64,${b64}`;
}

// Multi-reference composition via the Responses API + image_generation tool.
// The Images edits endpoint is multipart-only, which the Tauri HTTP proxy cannot
// send, so composition goes through the JSON Responses API instead.
async function composeViaResponsesApi(
  config: ImageModelConfig,
  prompt: string,
  referenceImages: string[],
  apiKey: string
): Promise<string> {
  const opts = (config.transportOptions ?? {}) as Record<string, string>;
  const model = opts.responsesModel ?? config.models.generate;

  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  for (const reference of referenceImages) {
    content.push({ type: "input_image", image_url: ensureDataUrl(reference) });
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      tools: [{ type: "image_generation" }],
    }),
  });

  if (!response.ok) {
    throw new Error(parseOpenAiError(await response.text(), response.status));
  }

  const data = (await response.json()) as {
    output?: Array<{ type?: string; result?: string }>;
  };
  const imageCall = data.output?.find((item) => item.type === "image_generation_call");
  const b64 = imageCall?.result;
  if (!b64) throw new Error(`No composed image found in ${config.name} response`);
  return `data:image/png;base64,${b64}`;
}

export const openaiImageTransport: ImageTransport = {
  async generateImage(config, prompt, apiKey) {
    return generateViaImagesApi(config, prompt, apiKey);
  },

  async composeImage(config, prompt, referenceImages, apiKey) {
    if (referenceImages.length === 0) {
      throw new Error("composeImage requires at least one reference image");
    }
    return composeViaResponsesApi(config, prompt, referenceImages, apiKey);
  },
};
