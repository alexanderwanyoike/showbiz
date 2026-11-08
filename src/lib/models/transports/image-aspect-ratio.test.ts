import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageModelConfig } from "../config-schema";

const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../http", () => http);
const fal = vi.hoisted(() => ({
  submitFalQueueRequest: vi.fn(),
  pollFalResult: vi.fn(),
  runFalInference: vi.fn(),
  uploadImageToFal: vi.fn((image: string) => image),
}));
vi.mock("../fal-shared", () => fal);

import { falImageTransport } from "./fal-image";
import { googleImageTransport } from "./google-image";
import { googleInteractionsImageTransport } from "./google-interactions-image";
import { openRouterImageTransport } from "./openrouter";

const wide = { aspectRatio: "16:9" };
const reference = "data:image/png;base64,AAA";
const base = {
  description: "test",
  enabled: true,
  supportsEditing: true,
  supportsInpainting: false,
  supportsComposition: true,
} as const;
const gemini: ImageModelConfig = {
  ...base,
  id: "nano-banana",
  name: "Nano Banana",
  transport: "google-image",
  apiKeyProvider: "gemini",
  models: { generate: "gemini-2.5-flash-image", edit: "gemini-2.5-flash-image" },
};
const interactions: ImageModelConfig = {
  ...base,
  id: "nano-banana-2",
  name: "Nano Banana 2",
  transport: "google-interactions-image",
  apiKeyProvider: "gemini",
  models: { generate: "gemini-3.1-flash-image", edit: "gemini-3.1-flash-image" },
};
const openRouter: ImageModelConfig = {
  ...base,
  id: "seedream-4.5-openrouter",
  name: "Seedream 4.5",
  transport: "openrouter-image",
  apiKeyProvider: "openrouter",
  models: { generate: "bytedance-seed/seedream-4.5", edit: "bytedance-seed/seedream-4.5" },
};
const kontext: ImageModelConfig = {
  ...base,
  id: "flux-kontext-fal",
  name: "Flux Kontext",
  transport: "fal-image",
  apiKeyProvider: "fal",
  transportOptions: {
    endpoint: "fal-ai/flux-pro/kontext/text-to-image",
    editEndpoint: "fal-ai/flux-pro/kontext",
    directInference: true,
    aspectRatioParam: "aspect_ratio",
  },
  models: { generate: "flux-kontext-fal", edit: "flux-kontext-fal" },
  generationModes: { imageToImage: { enabled: true, imageInput: "image_url" } },
};
const gptImage: ImageModelConfig = {
  ...base,
  id: "gpt-image-2",
  name: "GPT Image 2",
  transport: "fal-image",
  apiKeyProvider: "fal",
  transportOptions: {
    endpoint: "openai/gpt-image-2",
    editEndpoint: "openai/gpt-image-2/edit",
    directInference: true,
    aspectRatioParam: "image_size",
  },
  models: { generate: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit" },
  generationModes: { imageToImage: { enabled: true, imageInput: "image_urls", imageFormat: "array" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  http.fetch.mockImplementation(async (url: string) => {
    if (url.includes(":generateContent"))
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: "Zm9v", mimeType: "image/png" } }] } }] }),
      );
    if (url.endsWith("/interactions"))
      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [{ type: "model_output", content: [{ type: "image", data: "Zm9v", mime_type: "image/png" }] }],
        }),
      );
    if (url.includes("openrouter.ai"))
      return new Response(JSON.stringify({ id: "job", data: [{ b64_json: "Zm9v", media_type: "image/png" }] }));
    return new Response(new Blob(["image"], { type: "image/png" }));
  });
  fal.runFalInference.mockResolvedValue({ images: [{ url: "https://fal.media/picture.png" }] });
});
const sentBody = () => JSON.parse((http.fetch.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
const falInput = () => fal.runFalInference.mock.calls[0][1] as Record<string, unknown>;

describe("asking each provider for a 16:9 picture", () => {
  it("sets Gemini's imageConfig.aspectRatio on generate, edit and compose, and nothing otherwise", async () => {
    await googleImageTransport.generateImage(gemini, "A frame", "key", undefined, wide);
    expect(sentBody().generationConfig).toEqual({ responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "16:9" } });
    for (const call of [
      () => googleImageTransport.editImage!(gemini, "Darker", reference, "key", undefined, wide),
      () => googleImageTransport.composeImage!(gemini, "A frame", [reference], "key", undefined, wide),
    ]) {
      http.fetch.mockClear();
      await call();
      expect(sentBody().generationConfig).toMatchObject({ imageConfig: { aspectRatio: "16:9" } });
    }
    http.fetch.mockClear();
    await googleImageTransport.generateImage(gemini, "A character", "key");
    expect(sentBody().generationConfig).toEqual({ responseModalities: ["IMAGE", "TEXT"] });
  });

  it("sets the Interactions API's response_format.aspect_ratio on every request kind", async () => {
    await googleInteractionsImageTransport.composeImage!(interactions, "A frame", [reference], "key", undefined, wide);
    expect(sentBody().response_format).toEqual({ type: "image", aspect_ratio: "16:9" });
    http.fetch.mockClear();
    await googleInteractionsImageTransport.editImage!(interactions, "Darker", reference, "key", undefined, wide);
    expect(sentBody().response_format).toEqual({ type: "image", aspect_ratio: "16:9" });
    http.fetch.mockClear();
    await googleInteractionsImageTransport.generateImage(interactions, "A character", "key");
    expect(sentBody().response_format).toEqual({ type: "image" });
  });

  it("sets OpenRouter's aspect_ratio, also with reference pictures", async () => {
    await openRouterImageTransport.composeImage!(openRouter, "A frame", [reference], "key", undefined, wide);
    expect(sentBody()).toMatchObject({ aspect_ratio: "16:9", input_references: [{ type: "image_url" }] });
    http.fetch.mockClear();
    await openRouterImageTransport.generateImage(openRouter, "A character", "key");
    expect(sentBody()).not.toHaveProperty("aspect_ratio");
  });

  it("uses each fal model's own parameter: aspect_ratio for Kontext, image_size for GPT Image 2", async () => {
    await falImageTransport.generateImage(kontext, "A frame", "key", undefined, wide);
    expect(falInput()).toMatchObject({ aspect_ratio: "16:9" });
    fal.runFalInference.mockClear();
    await falImageTransport.editImage!(kontext, "Darker", reference, "key", undefined, wide);
    expect(falInput()).toMatchObject({ aspect_ratio: "16:9", image_url: reference });
    fal.runFalInference.mockClear();
    await falImageTransport.composeImage!(gptImage, "A frame", [reference], "key", undefined, wide);
    expect(falInput()).toMatchObject({ image_size: "landscape_16_9", image_urls: [reference] });
    expect(falInput()).not.toHaveProperty("aspect_ratio");
    fal.runFalInference.mockClear();
    await falImageTransport.generateImage(gptImage, "A character", "key");
    expect(falInput()).not.toHaveProperty("image_size");
  });
});
