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

import { submitFalQueueRequest } from "../fal-shared";
const mockSubmitFalQueueRequest = vi.mocked(submitFalQueueRequest);

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

  it("sends duration as a number when numericDuration is set (LTX-2.3 / Kling 3)", async () => {
    const ltxConfig: VideoModelConfig = {
      ...seedanceConfig,
      id: "ltx-2.3-fal",
      numericDuration: true,
      generationModes: {
        imageToVideo: { endpoint: "fal-ai/ltx-2.3/image-to-video", inputs: { startImage: true } },
      },
      paramMapping: { duration: "duration", imageInput: "image_url" },
    };

    await falVideoTransport.generateVideoRequest!(ltxConfig, {
      mode: "image-to-video",
      prompt: "p",
      settings: { duration: "8" },
      startImage: "start",
    }, "key");

    expect(mockSubmitFalQueueRequest).toHaveBeenCalledWith(
      "fal-ai/ltx-2.3/image-to-video",
      expect.objectContaining({ duration: 8 }),
      "key"
    );
  });

  it("maps custom start/end image fields (Veo uses first_frame_url / last_frame_url)", async () => {
    const veoConfig: VideoModelConfig = {
      ...seedanceConfig,
      id: "veo-3.1-fal",
      generationModes: {
        imageToVideo: { endpoint: "fal-ai/veo3.1/first-last-frame-to-video", inputs: { startImage: true, endImage: true } },
      },
      paramMapping: { duration: "duration", imageInput: "first_frame_url", endImageInput: "last_frame_url" },
    };

    await falVideoTransport.generateVideoRequest!(veoConfig, {
      mode: "image-to-video",
      prompt: "p",
      settings: { duration: "8s" },
      startImage: "start",
      endImage: "end",
    }, "key");

    expect(mockSubmitFalQueueRequest).toHaveBeenCalledWith(
      "fal-ai/veo3.1/first-last-frame-to-video",
      expect.objectContaining({
        first_frame_url: "data:image/png;base64,start",
        last_frame_url: "data:image/png;base64,end",
      }),
      "key"
    );
  });
});
