import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { validateImageConfig } from "./config-schema";

const directory = path.resolve("src/lib/models/providers/image");
const configs = fs
  .readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => validateImageConfig(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"))));

it("lets every enabled image model except the local one make 16:9 frames", () => {
  const wide = configs.filter((config) => config.aspectRatios?.includes("16:9")).map((config) => config.id);
  expect(wide.sort()).toEqual(
    [
      "flux-dev-fal",
      "flux-kontext-fal",
      "gpt-image-2",
      "nano-banana",
      "nano-banana-2",
      "nano-banana-2-lite",
      "nano-banana-2-openrouter",
      "nano-banana-pro",
      "seedream-4.5-openrouter",
    ].sort(),
  );
  expect(configs.find((config) => config.id === "local-image")?.aspectRatios).toBeUndefined();
});

it("names the parameter each fal model takes its shape in", () => {
  const falParams = Object.fromEntries(
    configs
      .filter((config) => config.transport === "fal-image" && config.aspectRatios)
      .map((config) => [config.id, config.transportOptions?.aspectRatioParam]),
  );
  expect(falParams).toEqual({
    "flux-dev-fal": "image_size",
    "flux-kontext-fal": "aspect_ratio",
    "gpt-image-2": "image_size",
  });
});

it("refuses an aspect ratio list that is not a list of ratios", () => {
  const config = {
    id: "test-image",
    name: "Test Image",
    description: "A test image model",
    transport: "google-image",
    enabled: true,
    apiKeyProvider: "gemini",
    models: { generate: "test-model" },
    supportsEditing: false,
    supportsInpainting: false,
  };
  expect(() => validateImageConfig({ ...config, aspectRatios: ["16:9"] })).not.toThrow();
  expect(() => validateImageConfig({ ...config, aspectRatios: "16:9" })).toThrow("aspectRatios");
  expect(() => validateImageConfig({ ...config, aspectRatios: ["wide"] })).toThrow("aspectRatios");
});
