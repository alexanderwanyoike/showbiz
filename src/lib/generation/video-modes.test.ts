import { describe, expect, it } from "vitest";
import {
  chooseVideoGenerationMode,
  validateVideoGenerationRequest,
} from "./video-modes";
import type {
  GenerationReference,
  VideoGenerationRequest,
  VideoModelModeCapabilities,
} from "./types";

const baseCapabilities: VideoModelModeCapabilities = {
  textToVideo: { endpoint: "text" },
  imageToVideo: { endpoint: "image", supportsStartImage: true },
};

const imageRef: GenerationReference = {
  id: "variant-1",
  assetId: "asset-1",
  kind: "character",
  mediaType: "image",
  label: "Mara",
  data: "data:image/png;base64,abc",
};

describe("chooseVideoGenerationMode", () => {
  it("reports missing capabilities clearly", () => {
    expect(() =>
      chooseVideoGenerationMode(undefined as never, {
        hasStartImage: false,
        references: [imageRef],
      })
    ).toThrow("Video model capabilities are unavailable");
  });

  it("prefers reference-to-video when refs exist and the model supports them", () => {
    expect(
      chooseVideoGenerationMode(
        {
          ...baseCapabilities,
          referenceToVideo: {
            endpoint: "reference",
            imageReferencesMax: 9,
            promptSyntax: "@ImageN",
          },
        },
        { hasStartImage: true, references: [imageRef] }
      )
    ).toBe("reference-to-video");
  });

  it("falls back to image-to-video when references are unsupported", () => {
    expect(
      chooseVideoGenerationMode(baseCapabilities, {
        hasStartImage: true,
        references: [imageRef],
      })
    ).toBe("image-to-video");
  });

  it("falls back to text-to-video when no image is available", () => {
    expect(
      chooseVideoGenerationMode(baseCapabilities, {
        hasStartImage: false,
        references: [],
      })
    ).toBe("text-to-video");
  });
});

describe("validateVideoGenerationRequest", () => {
  it("rejects reference requests for models without reference mode", () => {
    const request: VideoGenerationRequest = {
      mode: "reference-to-video",
      prompt: "Use @Image1",
      settings: { duration: "8" },
      references: [imageRef],
    };

    expect(() =>
      validateVideoGenerationRequest(baseCapabilities, request)
    ).toThrow("does not support reference-to-video");
  });

  it("rejects too many image references", () => {
    const request: VideoGenerationRequest = {
      mode: "reference-to-video",
      prompt: "Use references",
      settings: { duration: "8" },
      references: Array.from({ length: 10 }, (_, index) => ({
        ...imageRef,
        id: `variant-${index}`,
      })),
    };

    expect(() =>
      validateVideoGenerationRequest(
        {
          ...baseCapabilities,
          referenceToVideo: {
            endpoint: "reference",
            imageReferencesMax: 9,
            promptSyntax: "@ImageN",
          },
        },
        request
      )
    ).toThrow("supports at most 9 image references");
  });
});
