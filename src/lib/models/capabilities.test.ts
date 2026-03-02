import { describe, it, expect } from "vitest";
import { videoConfigs, imageConfigs } from "./registry";

describe("video model capabilities consistency", () => {
  for (const config of videoConfigs) {
    describe(config.id, () => {
      it("default duration is in capabilities.durations", () => {
        expect(config.capabilities.durations).toContain(config.defaults.duration);
      });

      if (config.capabilities.resolutions) {
        it("default resolution is in capabilities.resolutions", () => {
          expect(config.defaults.resolution).toBeDefined();
          expect(config.capabilities.resolutions).toContain(config.defaults.resolution);
        });
      }

      if (config.capabilities.aspectRatios) {
        it("default aspectRatio is in capabilities.aspectRatios", () => {
          expect(config.defaults.aspectRatio).toBeDefined();
          expect(config.capabilities.aspectRatios).toContain(config.defaults.aspectRatio);
        });
      }

      it("supports at least one generation mode", () => {
        expect(
          config.models.textToVideo || config.models.imageToVideo
        ).toBeTruthy();
      });
    });
  }
});

describe("image model config consistency", () => {
  for (const config of imageConfigs) {
    describe(config.id, () => {
      it("has models.generate defined", () => {
        expect(config.models.generate).toBeTruthy();
      });
    });
  }
});
