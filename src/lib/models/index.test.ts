import { describe, it, expect } from "vitest";
import {
  getImageModel,
  getVideoModel,
  getAvailableImageModels,
  getAvailableVideoModels,
  getExperimentalVideoModels,
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
  it("returns all 9 enabled image models", () => {
    const models = getAvailableImageModels();
    expect(models).toHaveLength(9);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("imagen4");
    expect(ids).toContain("nano-banana");
    expect(ids).toContain("nano-banana-pro");
    expect(ids).toContain("flux-kontext");
    expect(ids).toContain("seedream-4.5");
    expect(ids).toContain("flux-schnell-fal");
    expect(ids).toContain("flux-dev-fal");
    expect(ids).toContain("flux-schnell-replicate");
    expect(ids).toContain("flux-dev-replicate");
  });

  it("each model has required fields", () => {
    for (const model of getAvailableImageModels()) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.apiKeyProvider).toBeTruthy();
    }
  });

  it("fal/replicate models have provider field, others do not", () => {
    const models = getAvailableImageModels();
    const falModel = models.find((m) => m.id === "flux-schnell-fal");
    expect(falModel?.provider).toBe("fal.ai");
    const replicateModel = models.find((m) => m.id === "flux-schnell-replicate");
    expect(replicateModel?.provider).toBe("Replicate");
    const imagen = models.find((m) => m.id === "imagen4");
    expect(imagen?.provider).toBeUndefined();
  });
});

describe("getAvailableVideoModels", () => {
  it("returns only the curated trusted video models", () => {
    const models = getAvailableVideoModels();
    expect(models).toHaveLength(6);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("veo3");
    expect(ids).toContain("veo3-fast");
    expect(ids).toContain("kling-3");
    expect(ids).toContain("kling-2.6");
    expect(ids).toContain("hailuo-2.3");
    expect(ids).toContain("wan-2.6");
    expect(ids).not.toContain("ltx-video");
    expect(ids).not.toContain("sora-2-pro");
    expect(ids).not.toContain("kling-3-fal");
    expect(ids).not.toContain("kling-2.6-replicate");
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

  it("fal/replicate models have provider field, others do not", () => {
    const models = getAvailableVideoModels();
    const kieModel = models.find((m) => m.id === "kling-2.6");
    expect(kieModel?.provider).toBe("kie.ai");
    const veo = models.find((m) => m.id === "veo3");
    expect(veo?.provider).toBeUndefined();
  });
});

describe("getExperimentalVideoModels", () => {
  it("returns the enabled video models outside the curated set", () => {
    const models = getExperimentalVideoModels();
    const ids = models.map((m) => m.id);

    expect(ids).toContain("ltx-video");
    expect(ids).toContain("sora-2-pro");
    expect(ids).toContain("kling-3-fal");
    expect(ids).toContain("kling-2.6-replicate");
    expect(ids).not.toContain("veo3");
    expect(ids).not.toContain("kling-3");
  });
});
