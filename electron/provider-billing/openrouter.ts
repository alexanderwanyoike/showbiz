import { z } from "zod";
import type { Result } from "../../shared/result";

const jobSchema = z.object({ id: z.string(), generation_id: z.string().optional(), usage: z.object({ cost: z.number().finite().nonnegative().nullable().optional() }).optional() });
const generationSchema = z.object({ data: z.object({ id: z.string(), total_cost: z.number().finite().nonnegative().nullable() }) });
const failure = (message: string): Result<never> => ({ ok: false, error: { code: "IO_ERROR", message } });
export async function readOpenRouterCharge(requestId: string, kind: string, key: string, http: typeof fetch): Promise<Result<number | null>> {
  const headers = { Authorization: `Bearer ${key}` };
  const microdollars = (cost: number): Result<number> => {
    const amount = Math.round(cost * 1000000);
    return Number.isSafeInteger(amount) ? { ok: true, value: amount } : failure("The OpenRouter charge is outside the supported USD range.");
  };
  try {
    let generationId = requestId;
    if (kind === "video") {
      const response = await http(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(requestId)}`, { headers, signal: AbortSignal.timeout(10000) });
      if (response.status === 401 || response.status === 403) return failure("OpenRouter billing access denied. Check the key in Settings; this cost remains unconfirmed.");
      if (response.status === 404) return { ok: true, value: null };
      if (!response.ok) return failure(`OpenRouter job billing is unavailable (${response.status}). This cost remains unconfirmed.`);
      const job = jobSchema.safeParse(await response.json());
      if (!job.success || job.data.id !== requestId) return failure("OpenRouter returned an invalid job billing record.");
      const cost = job.data.usage?.cost;
      if (typeof cost === "number") return microdollars(cost);
      if (!job.data.generation_id) return { ok: true, value: null };
      generationId = job.data.generation_id;
    }
    const response = await http(`https://openrouter.ai/api/v1/generation?${new URLSearchParams({ id: generationId })}`, { headers, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403) return failure("OpenRouter billing access denied. Check the key in Settings; this cost remains unconfirmed.");
    if (response.status === 404) return { ok: true, value: null };
    if (!response.ok) return failure(`OpenRouter billing is unavailable (${response.status}). This cost remains unconfirmed.`);
    const parsed = generationSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.data.id !== generationId) return failure("OpenRouter returned an invalid generation billing record.");
    return parsed.data.data.total_cost === null ? { ok: true, value: null } : microdollars(parsed.data.data.total_cost);
  } catch { return failure("Could not reach OpenRouter billing. This cost remains unconfirmed."); }
}
