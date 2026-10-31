import { z } from "zod";
import type { GenerationReceipt } from "../../../shared/generation-output";

export function openRouterReceipt(input: unknown): GenerationReceipt {
  const parsed = z.object({id: z.string().optional(), usage: z.object({cost: z.number().nonnegative().nullable().optional()}).optional()}).safeParse(input);
  const value = parsed.success ? parsed.data : {};
  const cost = value.usage?.cost;
  const amount = typeof cost === "number" ? Math.round(cost * 1000000) : null;
  return {
    reported_microusd: amount !== null && Number.isSafeInteger(amount) && amount >= 0 ? amount : null,
    provider_request_id: value.id ?? null,
  };
}
