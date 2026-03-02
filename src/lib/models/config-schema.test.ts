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
});
