import { beforeEach, describe, expect, it, vi } from "vitest";
import { falVideoTransport } from "./fal-video";
import type { VideoModelConfig } from "../config-schema";

vi.mock("../fal-shared", () => ({
  submitFalQueueRequest: vi.fn().mockResolvedValue({
    requestId: "req-1",
    statusUrl: "https://queue.fal.run/status",
    responseUrl: "https://queue.fal.run/response",
  }),
  pollFalResult: vi.fn().mockResolvedValue({ video: { url: "https://cdn.fal.ai/out.mp4" } }),
  uploadImageToFal: vi.fn((value: string) => value.startsWith("data:") ? value : `data:image/png;base64,${value}`),
}));

vi.mock("../http", () => ({
  fetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob(["video"], { type: "video/mp4" })),
  }),
}));

import { submitFalQueueRequest, pollFalResult } from "../fal-shared";
const mockSubmitFalQueueRequest = vi.mocked(submitFalQueueRequest);
const mockPollFalResult = vi.mocked(pollFalResult);

const seedanceConfig: VideoModelConfig = {
  id: "seedance-2-fal",
  name: "Seedance 2.0",
  description: "test",
  transport: "fal-video",
  enabled: true,
  apiKeyProvider: "fal",
  models: {
    textToVideo: "seedance-2-fal-t2v",
    imageToVideo: "seedance-2-fal-i2v",
  },
  generationModes: {
    textToVideo: { endpoint: "bytedance/seedance-2.0/text-to-video" },
    imageToVideo: {
      endpoint: "bytedance/seedance-2.0/image-to-video",
      inputs: { startImage: true, endImage: true },
    },
    referenceToVideo: {
      endpoint: "bytedance/seedance-2.0/reference-to-video",
      inputs: { imageReferences: { max: 9 } },
      promptSyntax: "@ImageN",
    },
  },
  paramMapping: {
    duration: "duration",
    resolution: "resolution",
    aspectRatio: "aspect_ratio",
    audio: "generate_audio",
    imageInput: "image_url",
  },
  capabilities: { durations: ["8"], hasAudio: true },
  defaults: { duration: "8", audio: true },
};

describe("falVideoTransport.generateVideoRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps Seedance reference-to-video references to image_urls", async () => {
    await falVideoTransport.generateVideoRequest!(seedanceConfig, {
      mode: "reference-to-video",
      prompt: "Use @Image1",
      settings: { duration: "8", audio: true },
      references: [
        {
          id: "var-1",
          assetId: "asset-1",
          kind: "character",
          mediaType: "image",
          label: "Mara",
          data: "data:image/png;base64,abc",
        },
      ],
    }, "key");

    expect(mockSubmitFalQueueRequest).toHaveBeenCalledWith(
      "bytedance/seedance-2.0/reference-to-video",
      expect.objectContaining({
        prompt: "Use @Image1",
        image_urls: ["data:image/png;base64,abc"],
        generate_audio: true,
      }),
      "key"
    );
    expect(mockPollFalResult).toHaveBeenCalledWith(
      "bytedance/seedance-2.0/reference-to-video",
      "req-1",
      "key",
      {
        statusUrl: "https://queue.fal.run/status",
        responseUrl: "https://queue.fal.run/response",
      }
    );
  });

  it("maps Seedance image-to-video end frame to end_image_url", async () => {
    await falVideoTransport.generateVideoRequest!(seedanceConfig, {
      mode: "image-to-video",
      prompt: "Move from start to end",
      settings: { duration: "8" },
      startImage: "start",
      endImage: "end",
    }, "key");

    expect(mockSubmitFalQueueRequest).toHaveBeenCalledWith(
      "bytedance/seedance-2.0/image-to-video",
      expect.objectContaining({
        image_url: "data:image/png;base64,start",
        end_image_url: "data:image/png;base64,end",
      }),
      "key"
    );
  });
});
