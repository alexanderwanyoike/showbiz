import { expect, it, vi } from "vitest";
import { imageProviders, videoProviders } from "./registry";
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
it("offers OpenRouter in the existing model registry and forwards receipts to the requesting generation", async () => {
  const image = imageProviders.get("nano-banana-2-openrouter");
  const video = videoProviders.get("veo-3.1-openrouter");
  expect(image?.apiKeyProvider).toBe("openrouter");
  expect(video?.modeCapabilities.imageToVideo?.supportsEndImage).toBe(true);
  http.fetch.mockResolvedValue(new Response(JSON.stringify({data: [{b64_json: "aA==", media_type: "image/png"}], usage: {cost: 0}})));
  const receipt = vi.fn(async () => {});
  expect(await image!.generateImage("Morning", "test-key", {receipt})).toBe("data:image/png;base64,aA==");
  expect(receipt).toHaveBeenCalledWith({reported_microusd: 0, provider_request_id: null});
});
