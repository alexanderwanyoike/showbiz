import { expect, it } from "vitest";
import { resolveShotModels } from "./shot-models";
it("inherits storyboard defaults and resolves each shot override independently", () => {
  const defaults = { image_model: "imagen4", video_model: "seedance-2-fal" };
  expect(
    resolveShotModels({ image_model: null, video_model: null }, defaults),
  ).toEqual(defaults);
  expect(
    resolveShotModels(
      { image_model: "gpt-image-1", video_model: null },
      defaults,
    ),
  ).toEqual({ image_model: "gpt-image-1", video_model: "seedance-2-fal" });
  expect(
    resolveShotModels(
      { image_model: null, video_model: "veo3" },
      { ...defaults, image_model: "gpt-image-1" },
    ),
  ).toEqual({ image_model: "gpt-image-1", video_model: "veo3" });
});

it("resolves loaded and saved storyboard defaults with the same supported video fallback", async () => {
  const { resolveStoryboardModels } = await import("./shot-models");
  expect(resolveStoryboardModels({ image_model: "nano-banana", video_model: "retired-video" }, [{ id: "seedance-2-fal" }])).toEqual({ image_model: "nano-banana", video_model: "seedance-2-fal" });
  expect(resolveStoryboardModels({ image_model: "nano-banana", video_model: "veo-3.1-fal" }, [{ id: "veo-3.1-fal" }])).toEqual({ image_model: "nano-banana", video_model: "veo-3.1-fal" });
});
