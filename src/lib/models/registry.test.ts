import { describe, it, expect } from "vitest";
import { videoConfigs, imageConfigs, videoProviders, imageProviders, getGroupedVideoModels, getGroupedImageModels } from "./registry";
import { VALID_VIDEO_TRANSPORTS, VALID_IMAGE_TRANSPORTS } from "./transports";

describe("video configs", () => {
  it("loads all 19 video configs", () => {
    expect(videoConfigs).toHaveLength(19);
  });

  it("all configs have valid transport", () => {
    for (const config of videoConfigs) {
      expect(VALID_VIDEO_TRANSPORTS).toContain(config.transport);
    }
  });

  it("seedance-2 is disabled", () => {
    const seedance = videoConfigs.find((c) => c.id === "seedance-2");
    expect(seedance).toBeDefined();
    expect(seedance!.enabled).toBe(false);
  });

  it("all other video models are enabled", () => {
    const enabled = videoConfigs.filter((c) => c.enabled);
    expect(enabled).toHaveLength(18);
  });

  it("creates providers for all configs", () => {
    expect(videoProviders.size).toBe(19);
  });
});

describe("image configs", () => {
  it("loads all 9 image configs", () => {
    expect(imageConfigs).toHaveLength(9);
  });

  it("all configs have valid transport", () => {
    for (const config of imageConfigs) {
      expect(VALID_IMAGE_TRANSPORTS).toContain(config.transport);
    }
  });

  it("all image models are enabled", () => {
    const enabled = imageConfigs.filter((c) => c.enabled);
    expect(enabled).toHaveLength(9);
  });

  it("creates providers for all configs", () => {
    expect(imageProviders.size).toBe(9);
  });
});

describe("model grouping", () => {
  it("groups same-family video models", () => {
    const groups = getGroupedVideoModels();
    const klingGroup = groups.find((g) => g.family === "kling-3");
    expect(klingGroup).toBeDefined();
    expect(klingGroup!.models.length).toBeGreaterThanOrEqual(2);
  });

  it("puts unique models in single-entry groups", () => {
    const groups = getGroupedVideoModels();
    const veo3Group = groups.find((g) => g.family === "veo3");
    expect(veo3Group).toBeDefined();
    expect(veo3Group!.models).toHaveLength(1);
  });

  it("excludes disabled models from groups", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    expect(allModelIds).not.toContain("seedance-2");
  });

  it("every enabled video model is in exactly one group", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    const enabledCount = Array.from(videoProviders.values()).filter((m) => m.enabled).length;
    expect(allModelIds).toHaveLength(enabledCount);
    expect(new Set(allModelIds).size).toBe(enabledCount);
  });

  it("groups same-family image models", () => {
    const groups = getGroupedImageModels();
    const fluxSchnellGroup = groups.find((g) => g.family === "flux-schnell");
    expect(fluxSchnellGroup).toBeDefined();
    expect(fluxSchnellGroup!.models.length).toBeGreaterThanOrEqual(2);
  });

  it("grouped models include provider field from config", () => {
    const groups = getGroupedVideoModels();
    const klingGroup = groups.find((g) => g.family === "kling-2.6");
    expect(klingGroup).toBeDefined();
    const falModel = klingGroup!.models.find((m) => m.id === "kling-2.6-fal");
    expect(falModel?.provider).toBe("fal.ai");
    const replicateModel = klingGroup!.models.find((m) => m.id === "kling-2.6-replicate");
    expect(replicateModel?.provider).toBe("Replicate");

    const veo3Group = groups.find((g) => g.family === "veo3");
    expect(veo3Group).toBeDefined();
    expect(veo3Group!.models[0].provider).toBeUndefined();
  });
});
