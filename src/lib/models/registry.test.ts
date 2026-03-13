import { describe, it, expect } from "vitest";
import { videoConfigs, imageConfigs, videoProviders, imageProviders, getGroupedVideoModels, getGroupedImageModels } from "./registry";
import { VALID_VIDEO_TRANSPORTS, VALID_IMAGE_TRANSPORTS } from "./transports";

describe("video configs", () => {
  it("loads at least one video config", () => {
    expect(videoConfigs.length).toBeGreaterThan(0);
  });

  it("all configs have valid transport", () => {
    for (const config of videoConfigs) {
      expect(VALID_VIDEO_TRANSPORTS).toContain(config.transport);
    }
  });

  it("all configs have required fields", () => {
    for (const config of videoConfigs) {
      expect(config.id).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(typeof config.enabled).toBe("boolean");
      expect(config.apiKeyProvider).toBeTruthy();
      expect(config.capabilities).toBeDefined();
      expect(config.defaults).toBeDefined();
      expect(config.defaults.duration).toBeTruthy();
      expect(config.capabilities.durations.length).toBeGreaterThan(0);
    }
  });

  it("all configs have unique ids", () => {
    const ids = videoConfigs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("creates a provider for every config", () => {
    expect(videoProviders.size).toBe(videoConfigs.length);
    for (const config of videoConfigs) {
      expect(videoProviders.has(config.id as never)).toBe(true);
    }
  });

  it("configs with modelFamily must have provider set", () => {
    for (const config of videoConfigs) {
      if (config.modelFamily) {
        expect(config.provider).toBeTruthy();
      }
    }
  });

  it("each config has at least one model endpoint", () => {
    for (const config of videoConfigs) {
      const hasEndpoint = !!config.models.textToVideo || !!config.models.imageToVideo;
      expect(hasEndpoint).toBe(true);
    }
  });
});

describe("image configs", () => {
  it("loads at least one image config", () => {
    expect(imageConfigs.length).toBeGreaterThan(0);
  });

  it("all configs have valid transport", () => {
    for (const config of imageConfigs) {
      expect(VALID_IMAGE_TRANSPORTS).toContain(config.transport);
    }
  });

  it("all configs have required fields", () => {
    for (const config of imageConfigs) {
      expect(config.id).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(typeof config.enabled).toBe("boolean");
      expect(config.apiKeyProvider).toBeTruthy();
      expect(typeof config.supportsEditing).toBe("boolean");
      expect(typeof config.supportsInpainting).toBe("boolean");
      expect(config.models.generate).toBeTruthy();
    }
  });

  it("all configs have unique ids", () => {
    const ids = imageConfigs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("creates a provider for every config", () => {
    expect(imageProviders.size).toBe(imageConfigs.length);
    for (const config of imageConfigs) {
      expect(imageProviders.has(config.id as never)).toBe(true);
    }
  });

  it("configs with modelFamily must have provider set", () => {
    for (const config of imageConfigs) {
      if (config.modelFamily) {
        expect(config.provider).toBeTruthy();
      }
    }
  });
});

describe("model grouping", () => {
  it("only includes enabled video models in groups", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));

    for (const id of allModelIds) {
      const provider = videoProviders.get(id as never);
      expect(provider?.enabled).toBe(true);
    }
  });

  it("excludes disabled video models from groups", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = new Set(groups.flatMap((g) => g.models.map((m) => m.id)));
    const disabledIds = videoConfigs.filter((c) => !c.enabled).map((c) => c.id);

    for (const id of disabledIds) {
      expect(allModelIds.has(id)).toBe(false);
    }
  });

  it("every enabled video model appears in exactly one group", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    const enabledCount = videoConfigs.filter((c) => c.enabled).length;

    expect(allModelIds).toHaveLength(enabledCount);
    expect(new Set(allModelIds).size).toBe(enabledCount);
  });

  it("same-family video models are grouped together", () => {
    const groups = getGroupedVideoModels();
    const familyConfigs = videoConfigs.filter((c) => c.enabled && c.modelFamily);

    for (const config of familyConfigs) {
      const group = groups.find((g) => g.family === config.modelFamily);
      expect(group).toBeDefined();
      expect(group!.models.some((m) => m.id === config.id)).toBe(true);
    }
  });

  it("video groups have non-empty displayName", () => {
    for (const group of getGroupedVideoModels()) {
      expect(group.displayName).toBeTruthy();
      expect(group.models.length).toBeGreaterThan(0);
    }
  });

  it("provider field propagates from config to grouped video models", () => {
    const groups = getGroupedVideoModels();
    for (const group of groups) {
      for (const model of group.models) {
        const config = videoConfigs.find((c) => c.id === model.id);
        expect(model.provider).toBe(config?.provider);
      }
    }
  });

  it("only includes enabled image models in groups", () => {
    const groups = getGroupedImageModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));

    for (const id of allModelIds) {
      const provider = imageProviders.get(id as never);
      expect(provider?.enabled).toBe(true);
    }
  });

  it("every enabled image model appears in exactly one group", () => {
    const groups = getGroupedImageModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    const enabledCount = imageConfigs.filter((c) => c.enabled).length;

    expect(allModelIds).toHaveLength(enabledCount);
    expect(new Set(allModelIds).size).toBe(enabledCount);
  });

  it("same-family image models are grouped together", () => {
    const groups = getGroupedImageModels();
    const familyConfigs = imageConfigs.filter((c) => c.enabled && c.modelFamily);

    for (const config of familyConfigs) {
      const group = groups.find((g) => g.family === config.modelFamily);
      expect(group).toBeDefined();
      expect(group!.models.some((m) => m.id === config.id)).toBe(true);
    }
  });
});
