import { describe, it, expect } from "vitest";
import { videoConfigs, imageConfigs, videoProviders, imageProviders } from "./registry";
import { VALID_VIDEO_TRANSPORTS, VALID_IMAGE_TRANSPORTS } from "./transports";

describe("video configs", () => {
  it("loads all 11 video configs", () => {
    expect(videoConfigs).toHaveLength(11);
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
    expect(enabled).toHaveLength(10);
  });

  it("creates providers for all configs", () => {
    expect(videoProviders.size).toBe(11);
  });
});

describe("image configs", () => {
  it("loads all 5 image configs", () => {
    expect(imageConfigs).toHaveLength(5);
  });

  it("all configs have valid transport", () => {
    for (const config of imageConfigs) {
      expect(VALID_IMAGE_TRANSPORTS).toContain(config.transport);
    }
  });

  it("all image models are enabled", () => {
    const enabled = imageConfigs.filter((c) => c.enabled);
    expect(enabled).toHaveLength(5);
  });

  it("creates providers for all configs", () => {
    expect(imageProviders.size).toBe(5);
  });
});
