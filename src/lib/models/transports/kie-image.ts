import { fetch } from "../http";
import { createKieTask, pollKieTask } from "../kie-shared";
import type { ImageTransport } from "./types";
import type { ImageModelConfig } from "../config-schema";

const KIE_API_BASE = "https://api.kie.ai";

async function blobToDataUrl(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function callFluxKontext(
  prompt: string,
  imageBase64: string | undefined,
  apiKey: string,
  endpoint: string
): Promise<string> {
  const body: Record<string, unknown> = { prompt };
  if (imageBase64) {
    body.image = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;
  }

  const res = await fetch(`${KIE_API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok || (json.code !== undefined && json.code !== 200)) {
    const msg: string = json.msg ?? json.message ?? "";
    if (res.status === 402 || json.code === 402) {
      throw new Error("Insufficient kie.ai credits. Please top up your account.");
    }
    if (res.status === 401 || json.code === 401) {
      throw new Error("Invalid kie.ai API key.");
    }
    throw new Error(`Flux Kontext error (${res.status}): ${msg}`);
  }

  // Direct image URL in response
  if (json?.data?.imageUrl) {
    const imgRes = await fetch(json.data.imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to download Flux Kontext image: ${imgRes.status}`);
    return blobToDataUrl(await imgRes.blob());
  }

  // Async task-based response
  const taskId: string | undefined = json?.data?.taskId;
  if (taskId) {
    const imageUrl = await pollKieTask(taskId, apiKey);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to download Flux Kontext image: ${imgRes.status}`);
    return blobToDataUrl(await imgRes.blob());
  }

  throw new Error("Flux Kontext returned an unexpected response format");
}

async function callStandardKie(
  config: ImageModelConfig,
  prompt: string,
  apiKey: string
): Promise<string> {
  const modelId = config.models.generate;
  const input: Record<string, unknown> = { prompt, ...(config.fixedParams ?? {}) };
  const taskId = await createKieTask(modelId, input, apiKey);
  const imageUrl = await pollKieTask(taskId, apiKey);
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download ${config.name} image: ${imgRes.status}`);
  }
  const blob = await imgRes.blob();
  return blobToDataUrl(blob);
}

export const kieImageTransport: ImageTransport = {
  async generateImage(
    config: ImageModelConfig,
    prompt: string,
    apiKey: string
  ): Promise<string> {
    const endpoint = config.transportOptions?.endpoint as string | undefined;
    if (endpoint) {
      // Flux Kontext pattern
      return callFluxKontext(prompt, undefined, apiKey, endpoint);
    }
    // Standard kie task pattern
    return callStandardKie(config, prompt, apiKey);
  },

  async editImage(
    config: ImageModelConfig,
    editPrompt: string,
    sourceImageBase64: string,
    apiKey: string
  ): Promise<string> {
    const endpoint = config.transportOptions?.endpoint as string | undefined;
    if (endpoint) {
      return callFluxKontext(editPrompt, sourceImageBase64, apiKey, endpoint);
    }
    throw new Error(`${config.name} does not support image editing.`);
  },
};
