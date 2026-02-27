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
  it("returns all 3 image models", () => {
    const models = getAvailableImageModels();
    expect(models).toHaveLength(3);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("imagen4");
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
});

describe("getAvailableVideoModels", () => {
  it("returns all 3 video models", () => {
    const models = getAvailableVideoModels();
    expect(models).toHaveLength(3);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("veo3");
    expect(ids).toContain("veo3-fast");
    expect(ids).toContain("ltx-video");
  });

  it("each model has required fields", () => {
    for (const model of getAvailableVideoModels()) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.apiKeyProvider).toBeTruthy();
      expect(typeof model.supportsImageToVideo).toBe("boolean");
      expect(typeof model.supportsTextToVideo).toBe("boolean");
    }
  });
});
