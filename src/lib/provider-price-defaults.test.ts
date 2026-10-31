import { expect, it } from "vitest";
import { providerPrices } from "../../shared/provider-prices";
import { estimateGenerationCost } from "../../shared/generation-cost";
it("quotes documented default image and shot rates from their own providers", () => {
  const price = (id: string) => providerPrices.find(value => value.model_id === id) ?? null;
  expect(estimateGenerationCost(price("nano-banana-2-lite"), {kind: "image"})).toMatchObject({kind: "estimate", min_microusd: 33600});
  expect(estimateGenerationCost(price("nano-banana-pro"), {kind: "image"})).toMatchObject({kind: "estimate", min_microusd: 134400});
  expect(estimateGenerationCost(price("seedance-2-fal"), {kind: "video", duration: 8, resolution: "720p", audio: true})).toMatchObject({kind: "estimate", min_microusd: 2427200});
  expect(estimateGenerationCost(price("seedance-2-fal"), {kind: "video", duration: 8, resolution: "1080p", audio: false})).toMatchObject({kind: "estimate", min_microusd: 5456000});
  expect(estimateGenerationCost(price("veo-3.1-fal"), {kind: "video", duration: 8, resolution: "1080p", audio: true})).toMatchObject({kind: "estimate", min_microusd: 3200000});
  expect(estimateGenerationCost(price("veo-3.1-fal"), {kind: "video", duration: 8, resolution: "4k", audio: false})).toMatchObject({kind: "estimate", min_microusd: 3200000});
});
