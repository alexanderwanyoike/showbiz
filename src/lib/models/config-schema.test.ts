import { describe, it, expect } from "vitest";
import { validateVideoConfig, validateImageConfig } from "./config-schema";

describe("validateVideoConfig", () => {
  const validConfig = {
    id: "test-video",
    name: "Test Video",
    description: "A test video model",
    transport: "kie-video",
    enabled: true,
    apiKeyProvider: "kie",
    models: { textToVideo: "test/model" },
    capabilities: { durations: ["8"] },
    defaults: { duration: "8" },
  };

  it("accepts a valid config", () => {
    expect(() => validateVideoConfig(validConfig)).not.toThrow();
  });

  it("rejects missing required fields", () => {
    const { id, ...noId } = validConfig;
    expect(() => validateVideoConfig(noId)).toThrow("missing required field");
  });

  it("rejects unknown transport", () => {
    expect(() => validateVideoConfig({ ...validConfig, transport: "magic" })).toThrow(
      "unknown transport"
    );
  });

  it("rejects config with no model IDs", () => {
    expect(() => validateVideoConfig({ ...validConfig, models: {} })).toThrow(
      "must have at least one"
    );
  });

  it("rejects empty durations", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, capabilities: { durations: [] } })
    ).toThrow("non-empty array");
  });

  it("accepts fal-video transport", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, transport: "fal-video" })
    ).not.toThrow();
  });

  it("accepts replicate-video transport", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, transport: "replicate-video" })
    ).not.toThrow();
  });

  it("accepts provider and modelFamily", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, provider: "fal.ai", modelFamily: "kling-3" })
    ).not.toThrow();
  });

  it("accepts provider without modelFamily", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, provider: "kie.ai" })
    ).not.toThrow();
  });

  it("rejects modelFamily without provider", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, modelFamily: "kling-3" })
    ).toThrow('"modelFamily" requires "provider"');
  });

  it("rejects empty provider string", () => {
    expect(() =>
      validateVideoConfig({ ...validConfig, provider: "" })
    ).toThrow('"provider" must be a non-empty string');
  });
});

describe("validateImageConfig", () => {
  const validConfig = {
    id: "test-image",
    name: "Test Image",
    description: "A test image model",
    transport: "google-image",
    enabled: true,
    apiKeyProvider: "gemini",
    models: { generate: "test-model" },
    supportsEditing: false,
    supportsInpainting: false,
  };

  it("accepts a valid config", () => {
    expect(() => validateImageConfig(validConfig)).not.toThrow();
  });

  it("rejects missing required fields", () => {
    const { name, ...noName } = validConfig;
    expect(() => validateImageConfig(noName)).toThrow("missing required field");
  });

  it("rejects unknown transport", () => {
    expect(() => validateImageConfig({ ...validConfig, transport: "magic" })).toThrow(
      "unknown transport"
    );
  });

  it("rejects missing models.generate", () => {
    expect(() => validateImageConfig({ ...validConfig, models: {} })).toThrow(
      "models.generate is required"
    );
  });

  it("accepts fal-image transport", () => {
    expect(() =>
      validateImageConfig({ ...validConfig, transport: "fal-image" })
    ).not.toThrow();
  });

  it("accepts replicate-image transport", () => {
    expect(() =>
      validateImageConfig({ ...validConfig, transport: "replicate-image" })
    ).not.toThrow();
  });

  it("accepts provider and modelFamily", () => {
    expect(() =>
      validateImageConfig({ ...validConfig, provider: "fal.ai", modelFamily: "flux-schnell" })
    ).not.toThrow();
  });

  it("rejects modelFamily without provider", () => {
    expect(() =>
      validateImageConfig({ ...validConfig, modelFamily: "flux-schnell" })
    ).toThrow('"modelFamily" requires "provider"');
  });

  it("rejects empty provider string", () => {
    expect(() =>
      validateImageConfig({ ...validConfig, provider: "" })
    ).toThrow('"provider" must be a non-empty string');
  });
});
