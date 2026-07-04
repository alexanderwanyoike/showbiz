import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ImageModelConfig } from "../config-schema";

vi.mock("../fal-shared", () => ({
  submitFalQueueRequest: vi.fn().mockResolvedValue({
    requestId: "req-1",
    statusUrl: "https://queue.fal.run/status",
    responseUrl: "https://queue.fal.run/response",
  }),
  pollFalResult: vi.fn().mockResolvedValue({ images: [{ url: "https://fal.media/queue.jpg" }] }),
  runFalInference: vi.fn().mockResolvedValue({ images: [{ url: "https://fal.media/direct.jpg" }] }),
  uploadImageToFal: vi.fn((image: string) => image.startsWith("data:") ? image : `data:image/png;base64,${image}`),
}));

vi.mock("../http", () => ({
  fetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob(["image"])),
  }),
}));

vi.mock("../types", async () => {
  const actual = await vi.importActual<typeof import("../types")>("../types");
  return {
    ...actual,
    blobToBase64: vi.fn().mockResolvedValue("data:image/jpeg;base64,aW1hZ2U="),
  };
});

import { falImageTransport } from "./fal-image";
import { runFalInference, submitFalQueueRequest } from "../fal-shared";
import { blobToBase64 } from "../types";

const mockRunFalInference = vi.mocked(runFalInference);
const mockSubmitFalQueueRequest = vi.mocked(submitFalQueueRequest);
const mockBlobToBase64 = vi.mocked(blobToBase64);

const config: ImageModelConfig = {
  id: "flux-kontext-fal",
  name: "Flux Kontext",
  description: "test",
  transport: "fal-image",
  transportOptions: {
    endpoint: "fal-ai/flux-pro/kontext/text-to-image",
    editEndpoint: "fal-ai/flux-pro/kontext",
    directInference: true,
  },
  enabled: true,
  apiKeyProvider: "fal",
  models: {
    generate: "flux-kontext-fal",
    edit: "flux-kontext-fal",
  },
  generationModes: {
    textToImage: { enabled: true, endpoint: "fal-ai/flux-pro/kontext/text-to-image" },
    imageToImage: { enabled: true, endpoint: "fal-ai/flux-pro/kontext", imageInput: "image_url" },
  },
  supportsEditing: true,
  supportsInpainting: false,
};

// GPT Image 2 on fal: the /edit endpoint takes an ARRAY of reference images
// under `image_urls`, driving both single edits and multi-reference compose.
const gptConfig: ImageModelConfig = {
  id: "gpt-image-2",
  name: "GPT Image 2",
  description: "test",
  transport: "fal-image",
  transportOptions: {
    endpoint: "openai/gpt-image-2",
    editEndpoint: "openai/gpt-image-2/edit",
    directInference: true,
  },
  enabled: true,
  apiKeyProvider: "fal",
  models: { generate: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit" },
  generationModes: {
    textToImage: { enabled: true, endpoint: "openai/gpt-image-2" },
    imageToImage: { enabled: true, endpoint: "openai/gpt-image-2/edit", imageInput: "image_urls", imageFormat: "array" },
  },
  supportsEditing: true,
  supportsInpainting: false,
  supportsComposition: true,
};

describe("falImageTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses direct fal.run inference for configured text-to-image models", async () => {
    await falImageTransport.generateImage(config, "a character portrait", "key");

    expect(mockRunFalInference).toHaveBeenCalledWith(
      "fal-ai/flux-pro/kontext/text-to-image",
      { prompt: "a character portrait" },
      "key"
    );
    expect(mockSubmitFalQueueRequest).not.toHaveBeenCalled();
  });

  it("uses direct fal.run inference for configured image edits", async () => {
    await falImageTransport.editImage!(config, "turn into anime", "abc", "key");

    expect(mockRunFalInference).toHaveBeenCalledWith(
      "fal-ai/flux-pro/kontext",
      { prompt: "turn into anime", image_url: "data:image/png;base64,abc" },
      "key"
    );
    expect(mockSubmitFalQueueRequest).not.toHaveBeenCalled();
  });

  it("adds an image MIME type when the Rust HTTP proxy returns an untyped blob", async () => {
    await falImageTransport.editImage!(config, "turn into anime", "abc", "key");

    const blob = mockBlobToBase64.mock.calls[0]?.[0];
    expect(blob?.type).toBe("image/jpeg");
  });

  it("composeImage sends every reference image as an array under the configured field", async () => {
    await falImageTransport.composeImage!(gptConfig, "Alex in the office", ["ref1", "ref2"], "key");

    expect(mockRunFalInference).toHaveBeenCalledWith(
      "openai/gpt-image-2/edit",
      { prompt: "Alex in the office", image_urls: ["data:image/png;base64,ref1", "data:image/png;base64,ref2"] },
      "key"
    );
  });

  it("editImage wraps a single image in an array when imageFormat is 'array'", async () => {
    await falImageTransport.editImage!(gptConfig, "make it night", "abc", "key");

    expect(mockRunFalInference).toHaveBeenCalledWith(
      "openai/gpt-image-2/edit",
      { prompt: "make it night", image_urls: ["data:image/png;base64,abc"] },
      "key"
    );
  });

  it("composeImage rejects an empty reference list", async () => {
    await expect(falImageTransport.composeImage!(gptConfig, "x", [], "key")).rejects.toThrow("at least one reference image");
  });
});
