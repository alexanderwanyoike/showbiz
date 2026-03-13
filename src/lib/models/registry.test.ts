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

  it("only veo models are enabled", () => {
    const enabled = videoConfigs.filter((c) => c.enabled);
    expect(enabled).toHaveLength(2);
    const enabledIds = enabled.map((c) => c.id).sort();
    expect(enabledIds).toEqual(["veo3", "veo3-fast"]);
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

  it("only nano banana models are enabled", () => {
    const enabled = imageConfigs.filter((c) => c.enabled);
    expect(enabled).toHaveLength(2);
    const enabledIds = enabled.map((c) => c.id).sort();
    expect(enabledIds).toEqual(["nano-banana", "nano-banana-pro"]);
  });

  it("creates providers for all configs", () => {
    expect(imageProviders.size).toBe(9);
  });
});

describe("model grouping", () => {
  it("groups same-family video models", () => {
    const groups = getGroupedVideoModels();
    const veo3Group = groups.find((g) => g.family === "veo3");
    expect(veo3Group).toBeDefined();
    expect(veo3Group!.models.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes disabled models from groups", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    expect(allModelIds).not.toContain("seedance-2");
    expect(allModelIds).not.toContain("kling-3");
    expect(allModelIds).not.toContain("ltx-video");
  });

  it("every enabled video model is in exactly one group", () => {
    const groups = getGroupedVideoModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    const enabledCount = Array.from(videoProviders.values()).filter((m) => m.enabled).length;
    expect(allModelIds).toHaveLength(enabledCount);
    expect(new Set(allModelIds).size).toBe(enabledCount);
  });

  it("every enabled image model is in exactly one group", () => {
    const groups = getGroupedImageModels();
    const allModelIds = groups.flatMap((g) => g.models.map((m) => m.id));
    const enabledCount = Array.from(imageProviders.values()).filter((m) => m.enabled).length;
    expect(allModelIds).toHaveLength(enabledCount);
    expect(new Set(allModelIds).size).toBe(enabledCount);
  });

  it("veo3 group has no provider field", () => {
    const groups = getGroupedVideoModels();
    const veo3Group = groups.find((g) => g.family === "veo3");
    expect(veo3Group).toBeDefined();
    expect(veo3Group!.models[0].provider).toBeUndefined();
  });
});
