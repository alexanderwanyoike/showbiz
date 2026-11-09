import { expect, it } from "vitest";
import { getAvailableVideoModels } from "./models";
import { resolveShotVideoSettings } from "./shot-video-settings";
it("restores matching shot settings and uses the new model defaults instead of incompatible saved settings", () => {
  const seedance = getAvailableVideoModels().find(
    (model) => model.id === "seedance-2-fal",
  )!;
  const veo = getAvailableVideoModels().find(
    (model) => model.id === "veo-3.1-openrouter",
  )!;
  const saved = JSON.stringify({
    model_id: seedance.id,
    settings: {
      duration: "4",
      resolution: "720p",
      aspect_ratio: "16:9",
      audio: false,
    },
  });
  expect(resolveShotVideoSettings(saved, seedance)).toMatchObject({
    source: "saved",
    settings: {
      duration: "4",
      resolution: "720p",
      aspectRatio: "16:9",
      audio: false,
    },
  });
  expect(resolveShotVideoSettings(saved, veo)).toMatchObject({
    source: "model-defaults",
    settings: veo.defaults,
  });
  expect(resolveShotVideoSettings("broken-json", seedance)).toMatchObject({
    source: "model-defaults",
    settings: seedance.defaults,
    notice: expect.stringContaining("could not be read"),
  });
});

it("keeps the saved settings a model can use and falls back only for the ones it cannot", () => {
  const h3 = getAvailableVideoModels().find((model) => model.id === "minimax-h3-fal")!;
  const withAudio = JSON.stringify({
    model_id: h3.id,
    settings: { duration: "8", resolution: "768P", audio: true },
  });
  expect(resolveShotVideoSettings(withAudio, h3)).toEqual({
    source: "saved",
    settings: { duration: "8", resolution: "768P" },
    notice: "Saved for this shot. MiniMax H3 cannot use the saved audio, so it is left to the model.",
  });
  const tooLong = JSON.stringify({
    model_id: h3.id,
    settings: { duration: "30", resolution: "480P", aspect_ratio: "21:9" },
  });
  expect(resolveShotVideoSettings(tooLong, h3)).toEqual({
    source: "saved",
    settings: { duration: "5", resolution: "480P" },
    notice: "Saved for this shot. MiniMax H3 cannot use the saved duration and aspect ratio, so they are left to the model.",
  });
});
