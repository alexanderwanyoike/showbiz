import { getFalPrice } from "./fal-pricing";
import { invoke } from "./bridge";
import type { GenerationPrice } from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

const lookups = new Map<string, { key: string; operation: Promise<Result<GenerationPrice>> }>();
export async function refreshFalPrice(modelId: string, endpoint: string, kind: string, key: string): Promise<Result<GenerationPrice>> {
  const identity = `${kind}:${modelId}:${endpoint}`;
  const existing = lookups.get(identity);
  if (existing?.key === key) return existing.operation;
  const operation = (async (): Promise<Result<GenerationPrice>> => {
    const fresh = await getFalPrice(modelId, endpoint, key);
    if (!fresh.ok) return fresh;
    const currentKey = await invoke<string | null>("get_api_key", { provider: "fal" });
    if (currentKey !== key) return { ok: false, error: { code: "INVALID_INPUT", message: "The FAL account changed while pricing loaded. Check the estimate again." } };
    return invoke<Result<GenerationPrice>>("save_generation_price", { kind, price: fresh.value });
  })();
  lookups.set(identity, { key, operation });
  try { return await operation; }
  finally { if (lookups.get(identity)?.operation === operation) lookups.delete(identity); }
}
