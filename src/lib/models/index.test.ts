import { describe, it, expect } from "vitest";
import {
  getImageModel,
  getVideoModel,
  getAvailableImageModels,
  getAvailableVideoModels,
} from "./index";

describe("getImageModel", () => {
  it("returns imagen4 provider", () => {
    const model = getImageModel("imagen4");
    expect(model.id).toBe("imagen4");
    expect(model.name).toBe("Imagen 4");
  });

  it("throws for unknown model", () => {
    expect(() => getImageModel("unknown" as never)).toThrow("Unknown image model");
  });
});

describe("getVideoModel", () => {
  it("returns veo3 provider", () => {
    const model = getVideoModel("veo3");
    expect(model.id).toBe("veo3");
    expect(model.name).toBe("Veo 3");
  });

  it("throws for unknown model", () => {
    expect(() => getVideoModel("unknown" as never)).toThrow("Unknown video model");
  });
});

describe("getAvailableImageModels", () => {
  it("returns only enabled image models", () => {
    const models = getAvailableImageModels();
    expect(models).toHaveLength(2);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("nano-banana");
    expect(ids).toContain("nano-banana-pro");
  });

  it("each model has required fields", () => {
    for (const model of getAvailableImageModels()) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.apiKeyProvider).toBeTruthy();
    }
  });

  it("disabled models are excluded", () => {
    const models = getAvailableImageModels();
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("imagen4");
    expect(ids).not.toContain("flux-kontext");
    expect(ids).not.toContain("seedream-4.5");
  });
});

describe("getAvailableVideoModels", () => {
  it("returns only veo models", () => {
    const models = getAvailableVideoModels();
    expect(models).toHaveLength(2);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("veo3");
    expect(ids).toContain("veo3-fast");
  });

  it("each model has required fields", () => {
    for (const model of getAvailableVideoModels()) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.apiKeyProvider).toBeTruthy();
      expect(typeof model.supportsImageToVideo).toBe("boolean");
      expect(typeof model.supportsTextToVideo).toBe("boolean");
      expect(model.capabilities).toBeDefined();
      expect(model.defaults).toBeDefined();
    }
  });

  it("disabled models are excluded", () => {
    const models = getAvailableVideoModels();
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("seedance-2");
    expect(ids).not.toContain("kling-3");
    expect(ids).not.toContain("ltx-video");
  });

  it("veo models have no provider field", () => {
    const models = getAvailableVideoModels();
    const veo = models.find((m) => m.id === "veo3");
    expect(veo?.provider).toBeUndefined();
  });
});
