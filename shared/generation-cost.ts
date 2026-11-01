export type GenerationKind = "image" | "image_edit" | "image_compose" | "video";
export interface GenerationPriceRate {
  unit: "image" | "second" | "megapixel" | "request";
  microusd: number;
  max_microusd?: number;
  resolution?: string;
  audio?: boolean;
  kind?: GenerationKind;
}
export interface GenerationPrice {
  provider: string;
  model_id: string;
  currency: "USD";
  source_url: string;
  source_kind?: "provider" | "published" | "manual";
  checked_at: string;
  endpoint_id?: string;
  estimate_basis?: "historical_request";
  billing_unit?: string;
  billing_unit_microusd?: number;
  rates: GenerationPriceRate[];
  excludes_input_cost?: boolean;
}
export interface GenerationCostRequest {
  kind: GenerationKind;
  duration?: number | string;
  duration_range?: [number, number];
  resolution?: string;
  audio?: boolean;
  width?: number;
  height?: number;
  count?: number;
  aspect_ratio?: string;
  mode?: string;
  has_end_frame?: boolean;
}
export type GenerationCostEstimate =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "estimate";
      min_microusd: number;
      max_microusd: number;
      price: GenerationPrice;
      stale: boolean;
      price_freshness?: "live" | "cached" | "stale";
      excludes_input_cost: boolean;
    };
const unavailable = (reason: string): GenerationCostEstimate => ({
  kind: "unavailable",
  reason,
});
export function generationRateSignature(
  rate: Pick<GenerationPriceRate, "unit" | "kind" | "resolution" | "audio">,
): string {
  return JSON.stringify([
    rate.unit,
    rate.kind ?? null,
    rate.resolution ?? null,
    rate.audio ?? null,
  ]);
}
export function generationRateMatchesRequest(
  rate: GenerationPriceRate,
  request: GenerationCostRequest,
): boolean {
  return (
    (rate.resolution === undefined || rate.resolution === request.resolution) &&
    (rate.audio === undefined || rate.audio === request.audio) &&
    (rate.kind === undefined || rate.kind === request.kind)
  );
}
export function selectGenerationRate(
  price: GenerationPrice,
  request: GenerationCostRequest,
): GenerationPriceRate | null {
  const matching = price.rates.filter((rate) =>
    generationRateMatchesRequest(rate, request),
  );
  const specificity = (rate: GenerationPriceRate) =>
    Number(rate.resolution !== undefined) +
    Number(rate.audio !== undefined) +
    Number(rate.kind !== undefined);
  const rank = Math.max(...matching.map(specificity));
  const best = matching.filter((rate) => specificity(rate) === rank);
  return best.length === 1 ? best[0] : null;
}
export function estimateGenerationCost(
  price: GenerationPrice | null,
  request: GenerationCostRequest,
  now = Date.now(),
): GenerationCostEstimate {
  if (!price)
    return unavailable("A provider rate is not available for this model.");
  const rate = selectGenerationRate(price, request);
  if (!rate)
    return unavailable(
      "A rate is not available for these generation settings.",
    );
  if (!Number.isSafeInteger(rate.microusd) || rate.microusd < 0)
    return unavailable("The provider rate is invalid.");
  const maximum = rate.max_microusd ?? rate.microusd;
  if (!Number.isSafeInteger(maximum) || maximum < rate.microusd)
    return unavailable("The provider rate range is invalid.");
  let units: [number, number] = [1, 1];
  if (rate.unit === "second") {
    if (request.kind !== "video")
      return unavailable("The price unit does not match this generation.");
    const duration = Number(request.duration);
    if (Number.isFinite(duration) && duration > 0) units = [duration, duration];
    else if (request.duration_range) units = request.duration_range;
    else return unavailable("Choose a duration to estimate the video cost.");
  } else if (rate.unit === "megapixel") {
    if (
      !Number.isSafeInteger(request.width) ||
      !Number.isSafeInteger(request.height) ||
      Number(request.width) <= 0 ||
      Number(request.height) <= 0
    )
      return unavailable("Choose image dimensions to estimate the cost.");
    const megapixels =
      (Number(request.width) * Number(request.height)) / 1000000;
    units = [megapixels, megapixels];
  } else if (rate.unit !== "request" && request.kind === "video")
    return unavailable("The price unit does not match this generation.");
  const count = request.count ?? 1;
  if (
    !Number.isSafeInteger(count) ||
    count <= 0 ||
    units.some((value) => !Number.isFinite(value) || value <= 0) ||
    units[1] < units[0]
  )
    return unavailable("The generation quantity is invalid.");
  const amounts = [
    Math.round(units[0] * count * rate.microusd),
    Math.round(units[1] * count * maximum),
  ];
  if (amounts.some((value) => !Number.isSafeInteger(value)))
    return unavailable("The estimated amount is too large.");
  const checked = Date.parse(price.checked_at);
  return {
    kind: "estimate",
    min_microusd: amounts[0],
    max_microusd: amounts[1],
    price,
    stale: price.source_kind !== "manual" && price.source_kind !== "published" && (!Number.isFinite(checked) || now - checked > 7 * 24 * 60 * 60 * 1000),
    excludes_input_cost: price.excludes_input_cost ?? false,
  };
}
