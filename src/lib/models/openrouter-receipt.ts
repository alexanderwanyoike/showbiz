import type { GenerationReceipt } from "../../../shared/generation-output";

export function openRouterReceipt(value: { id?: string; usage?: { cost?: number | null } }): GenerationReceipt {
  const cost = value.usage?.cost;
  const amount = typeof cost === "number" ? Math.round(cost * 1000000) : null;
  return {
    reported_microusd: amount !== null && Number.isSafeInteger(amount) && amount >= 0 ? amount : null,
    provider_request_id: value.id ?? null,
  };
}
