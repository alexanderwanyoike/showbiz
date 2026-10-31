import type { GenerationPrice, GenerationPriceRate } from "./generation-cost";

const checked_at = "2026-10-31T12:00:00Z";
const google = "https://ai.google.dev/gemini-api/docs/pricing";
function price(
  provider: string,
  model_id: string,
  source_url: string,
  rates: GenerationPriceRate[],
  excludes_input_cost = false,
): GenerationPrice {
  return {
    provider,
    model_id,
    source_url,
    rates,
    currency: "USD",
    source_kind: "provider",
    checked_at,
    excludes_input_cost,
  };
}
export const providerPrices: GenerationPrice[] = [
  price(
    "gemini",
    "nano-banana-2",
    google,
    [{ unit: "image", microusd: 67200 }],
    true,
  ),
  price(
    "gemini",
    "nano-banana-2-lite",
    google,
    [{ unit: "image", microusd: 33600 }],
    true,
  ),
  price(
    "gemini",
    "nano-banana-pro",
    google,
    [{ unit: "image", microusd: 134400 }],
    true,
  ),
  price(
    "gemini",
    "nano-banana",
    google,
    [{ unit: "image", microusd: 39000 }],
    true,
  ),
  price(
    "fal",
    "seedance-2-fal",
    "https://fal.ai/models/bytedance/seedance-2.0/image-to-video",
    [
      { unit: "second", microusd: 303400, resolution: "720p" },
      { unit: "second", microusd: 682000, resolution: "1080p" },
    ],
  ),
  price(
    "fal",
    "seedance-2-fast-fal",
    "https://fal.ai/models/bytedance/seedance-2.0/fast/image-to-video",
    [{ unit: "second", microusd: 241900, resolution: "720p" }],
  ),
  price(
    "fal",
    "veo-3.1-fal",
    "https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video",
    [
      ...["720p", "1080p"].flatMap((resolution) => [
        { unit: "second" as const, microusd: 200000, resolution, audio: false },
        { unit: "second" as const, microusd: 400000, resolution, audio: true },
      ]),
      { unit: "second", microusd: 400000, resolution: "4k", audio: false },
      { unit: "second", microusd: 600000, resolution: "4k", audio: true },
    ],
  ),
];
