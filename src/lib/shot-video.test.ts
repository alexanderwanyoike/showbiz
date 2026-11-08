import { afterEach, expect, it, vi } from "vitest";
import { buildShotVideoRequest, chooseShotVideoFrames } from "./shot-video";

const api = vi.hoisted(() => ({ getShotImageBase64: vi.fn(), getShotEndFrameBase64: vi.fn() }));
vi.mock("./backend-api", () => api);
afterEach(() => vi.resetAllMocks());

const endCapable = {
  modeCapabilities: {
    textToVideo: true,
    imageToVideo: { supportsEndImage: true, requiresEndImage: false },
  },
} as never;
const endRequired = {
  modeCapabilities: { imageToVideo: { supportsEndImage: true, requiresEndImage: true } },
} as never;
const settings = { duration: "5" };

it("uses an end frame only for image-to-video on a model that supports one", () => {
  expect(chooseShotVideoFrames(endCapable, { hasStartFrame: true, hasEndFrame: true })).toEqual({
    mode: "image-to-video",
    usesEndFrame: true,
  });
  expect(chooseShotVideoFrames(endCapable, { hasStartFrame: false, hasEndFrame: true })).toEqual({
    mode: "text-to-video",
    usesEndFrame: false,
  });
});

it("refuses a model that needs an end frame when the end frame cannot be read", async () => {
  api.getShotImageBase64.mockResolvedValue("data:image/png;base64,START");
  api.getShotEndFrameBase64.mockResolvedValue(null);
  await expect(
    buildShotVideoRequest("shot-1", endRequired, { hasStartFrame: true, hasEndFrame: true }, settings, "Door"),
  ).rejects.toThrow(/end frame/);
});
