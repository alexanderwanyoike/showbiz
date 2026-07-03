import { describe, expect, it } from "vitest";
import {
  chooseVideoGenerationMode,
  validateVideoGenerationRequest,
} from "./video-modes";
import type {
  VideoGenerationRequest,
  VideoModelModeCapabilities,
} from "./types";

const baseCapabilities: VideoModelModeCapabilities = {
  textToVideo: { endpoint: "text" },
  imageToVideo: { endpoint: "image", supportsStartImage: true, supportsEndImage: true },
};

describe("chooseVideoGenerationMode", () => {
  it("reports missing capabilities clearly", () => {
    expect(() =>
      chooseVideoGenerationMode(undefined as never, { hasStartImage: false })
    ).toThrow("Video model capabilities are unavailable");
  });

  it("chooses image-to-video when a start frame exists and the model supports it", () => {
    expect(
      chooseVideoGenerationMode(baseCapabilities, { hasStartImage: true })
    ).toBe("image-to-video");
  });

  it("falls back to text-to-video when no start frame is available", () => {
    expect(
      chooseVideoGenerationMode(baseCapabilities, { hasStartImage: false })
    ).toBe("text-to-video");
  });

  it("falls back to text-to-video when the model has no image-to-video mode", () => {
    expect(
      chooseVideoGenerationMode({ textToVideo: { endpoint: "text" } }, { hasStartImage: true })
    ).toBe("text-to-video");
  });
});

describe("validateVideoGenerationRequest", () => {
  it("rejects text-to-video for models without that mode", () => {
    const request: VideoGenerationRequest = {
      mode: "text-to-video",
      prompt: "A wide shot",
      settings: { duration: "8" },
    };
    expect(() =>
      validateVideoGenerationRequest({ imageToVideo: { endpoint: "image" } }, request)
    ).toThrow("does not support text-to-video");
  });

  it("rejects image-to-video without a start frame", () => {
    const request: VideoGenerationRequest = {
      mode: "image-to-video",
      prompt: "Pan across",
      settings: { duration: "8" },
    };
    expect(() =>
      validateVideoGenerationRequest(baseCapabilities, request)
    ).toThrow("requires a start frame");
  });

  it("accepts image-to-video with a start frame", () => {
    const request: VideoGenerationRequest = {
      mode: "image-to-video",
      prompt: "Pan across",
      settings: { duration: "8" },
      startImage: "data:image/png;base64,abc",
    };
    expect(() => validateVideoGenerationRequest(baseCapabilities, request)).not.toThrow();
  });

  it("rejects an end frame when the model does not support one", () => {
    const request: VideoGenerationRequest = {
      mode: "image-to-video",
      prompt: "Morph",
      settings: { duration: "8" },
      startImage: "data:image/png;base64,abc",
      endImage: "data:image/png;base64,def",
    };
    expect(() =>
      validateVideoGenerationRequest(
        { imageToVideo: { endpoint: "image", supportsStartImage: true, supportsEndImage: false } },
        request
      )
    ).toThrow("does not support an end frame");
  });

  it("accepts a start and end frame when supported", () => {
    const request: VideoGenerationRequest = {
      mode: "image-to-video",
      prompt: "Morph",
      settings: { duration: "8" },
      startImage: "data:image/png;base64,abc",
      endImage: "data:image/png;base64,def",
    };
    expect(() => validateVideoGenerationRequest(baseCapabilities, request)).not.toThrow();
  });

  const requiresEndCapabilities: VideoModelModeCapabilities = {
    imageToVideo: {
      endpoint: "image",
      supportsStartImage: true,
      supportsEndImage: true,
      requiresEndImage: true,
    },
  };

  it("rejects a missing end frame when the model requires one", () => {
    const request: VideoGenerationRequest = {
      mode: "image-to-video",
      prompt: "Morph",
      settings: { duration: "8" },
      startImage: "data:image/png;base64,abc",
    };
    expect(() => validateVideoGenerationRequest(requiresEndCapabilities, request)).toThrow(
      "requires both a start frame and an end frame"
    );
  });

  it("accepts start and end frames when the model requires an end frame", () => {
    const request: VideoGenerationRequest = {
      mode: "image-to-video",
      prompt: "Morph",
      settings: { duration: "8" },
      startImage: "data:image/png;base64,abc",
      endImage: "data:image/png;base64,def",
    };
    expect(() => validateVideoGenerationRequest(requiresEndCapabilities, request)).not.toThrow();
  });
});
