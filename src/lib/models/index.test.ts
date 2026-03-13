import { describe, it, expect } from "vitest";
import {
  getImageModel,
  getVideoModel,
  getAvailableImageModels,
  getAvailableVideoModels,
} from "./index";
import { videoConfigs, imageConfigs, videoProviders, imageProviders } from "./registry";

describe("getImageModel", () => {
  it("returns a provider for any loaded image config", () => {
    for (const config of imageConfigs) {
      const model = getImageModel(config.id as never);
      expect(model.id).toBe(config.id);
      expect(model.name).toBe(config.name);
    }
  });

  it("throws for unknown model", () => {
    expect(() => getImageModel("unknown" as never)).toThrow("Unknown image model");
  });
});

describe("getVideoModel", () => {
  it("returns a provider for any loaded video config", () => {
    for (const config of videoConfigs) {
      const model = getVideoModel(config.id as never);
      expect(model.id).toBe(config.id);
      expect(model.name).toBe(config.name);
    }
  });

  it("throws for unknown model", () => {
    expect(() => getVideoModel("unknown" as never)).toThrow("Unknown video model");
  });
});

describe("getAvailableImageModels", () => {
  it("returns only enabled image models", () => {
    const models = getAvailableImageModels();
    const enabledConfigs = imageConfigs.filter((c) => c.enabled);

    expect(models).toHaveLength(enabledConfigs.length);
    for (const model of models) {
      const provider = imageProviders.get(model.id as never);
      expect(provider?.enabled).toBe(true);
    }
  });

  it("excludes disabled image models", () => {
    const models = getAvailableImageModels();
    const ids = new Set(models.map((m) => m.id));
    const disabledIds = imageConfigs.filter((c) => !c.enabled).map((c) => c.id);

    for (const id of disabledIds) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it("each model has required fields", () => {
    for (const model of getAvailableImageModels()) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.description).toBeTruthy();
      expect(model.apiKeyProvider).toBeTruthy();
    }
  });

  it("provider field matches config", () => {
    for (const model of getAvailableImageModels()) {
      const config = imageConfigs.find((c) => c.id === model.id);
      expect(model.provider).toBe(config?.provider);
    }
  });
});

describe("getAvailableVideoModels", () => {
  it("returns only enabled video models", () => {
    const models = getAvailableVideoModels();
    const enabledConfigs = videoConfigs.filter((c) => c.enabled);

    expect(models).toHaveLength(enabledConfigs.length);
    for (const model of models) {
      const provider = videoProviders.get(model.id as never);
      expect(provider?.enabled).toBe(true);
    }
  });

  it("excludes disabled video models", () => {
    const models = getAvailableVideoModels();
    const ids = new Set(models.map((m) => m.id));
    const disabledIds = videoConfigs.filter((c) => !c.enabled).map((c) => c.id);

    for (const id of disabledIds) {
      expect(ids.has(id)).toBe(false);
    }
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

  it("provider field matches config", () => {
    for (const model of getAvailableVideoModels()) {
      const config = videoConfigs.find((c) => c.id === model.id);
      expect(model.provider).toBe(config?.provider);
    }
  });
});
