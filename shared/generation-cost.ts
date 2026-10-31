export type GenerationKind = "image" | "image_edit" | "image_compose" | "video";
export interface GenerationPriceRate {
  unit: "image" | "second" | "megapixel";
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
  source_kind?: "provider" | "manual";
  checked_at: string;
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
}
export type GenerationCostEstimate =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "estimate";
      min_microusd: number;
      max_microusd: number;
      price: GenerationPrice;
      stale: boolean;
      excludes_input_cost: boolean;
    };
const unavailable = (reason: string): GenerationCostEstimate => ({
  kind: "unavailable",
  reason,
});
export function estimateGenerationCost(
  price: GenerationPrice | null,
  request: GenerationCostRequest,
  now = Date.now(),
): GenerationCostEstimate {
  if (!price)
    return unavailable("A provider rate is not available for this model.");
  const matching = price.rates.filter(
    (rate) =>
      (rate.resolution === undefined ||
        rate.resolution === request.resolution) &&
      (rate.audio === undefined || rate.audio === request.audio) &&
      (rate.kind === undefined || rate.kind === request.kind),
  );
  const specificity = (rate: GenerationPriceRate) =>
    Number(rate.resolution !== undefined) +
    Number(rate.audio !== undefined) +
    Number(rate.kind !== undefined);
  const rank = Math.max(...matching.map(specificity));
  const best = matching.filter((rate) => specificity(rate) === rank);
  if (best.length !== 1)
    return unavailable(
      "A rate is not available for these generation settings.",
    );
  const rate = best[0];
  if (!Number.isSafeInteger(rate.microusd) || rate.microusd < 0)
    return unavailable("The provider rate is invalid.");
  const maximum = rate.max_microusd ?? rate.microusd;
  if (!Number.isSafeInteger(maximum) || maximum < rate.microusd) return unavailable("The provider rate range is invalid.");
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
  } else if (request.kind === "video")
    return unavailable("The price unit does not match this generation.");
  const count = request.count ?? 1;
  if (
    !Number.isSafeInteger(count) ||
    count <= 0 ||
    units.some((value) => !Number.isFinite(value) || value <= 0) ||
    units[1] < units[0]
  )
    return unavailable("The generation quantity is invalid.");
  const amounts = [Math.round(units[0] * count * rate.microusd), Math.round(units[1] * count * maximum)];
  if (amounts.some((value) => !Number.isSafeInteger(value)))
    return unavailable("The estimated amount is too large.");
  const checked = Date.parse(price.checked_at);
  return {
    kind: "estimate",
    min_microusd: amounts[0],
    max_microusd: amounts[1],
    price,
    stale: !Number.isFinite(checked) || now - checked > 7 * 24 * 60 * 60 * 1000,
    excludes_input_cost: price.excludes_input_cost ?? false,
  };
}
