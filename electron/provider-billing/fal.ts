import { z } from "zod";
import type { Result } from "../../shared/result";

const pageSchema = z.object({
  billing_events: z.array(z.object({ request_id: z.string(), cost_total: z.number().finite().nonnegative() })),
  has_more: z.boolean(), next_cursor: z.string().nullable(),
});
const failure = (message: string): Result<never> => ({ ok: false, error: { code: "IO_ERROR", message } });
export async function readFalCharges(
  requests: { provider_request_id: string; started_at: string }[], key: string, http: typeof fetch,
): Promise<Result<Map<string, number>>> {
  const wanted = new Set(requests.map((row) => row.provider_request_id));
  const amounts = new Map<string, number>();
  const earliest = Math.min(...requests.map((row) => Date.parse(row.started_at)));
  const start = earliest - 60 * 60 * 1000;
  const end = Math.min(Date.now(), start + 90 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({ request_id: [...wanted].join(","), start: new Date(start).toISOString(), end: new Date(end).toISOString(), limit: "10000" });
  const cursors = new Set<string>();
  try {
    for (let page = 0; page < 10; page++) {
      const response = await http(`https://api.fal.ai/v1/models/billing-events?${params}`, { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(10000) });
      if (response.status === 401 || response.status === 403)
        return failure("FAL billing access denied. Confirmed charges need a key with billing:usage:read, auth:keys:read and account:users:read. This cost remains unconfirmed.");
      if (!response.ok) return failure(`FAL billing is unavailable (${response.status}). This cost remains unconfirmed.`);
      const parsed = pageSchema.safeParse(await response.json());
      if (!parsed.success) return failure("FAL returned an unsupported billing response. This cost remains unconfirmed.");
      for (const event of parsed.data.billing_events) {
        if (!wanted.has(event.request_id)) continue;
        const amount = (amounts.get(event.request_id) ?? 0) + Math.round(event.cost_total * 1000000);
        if (!Number.isSafeInteger(amount)) return failure("The FAL charge is outside the supported USD range.");
        amounts.set(event.request_id, amount);
      }
      if (!parsed.data.has_more) return { ok: true, value: amounts };
      const cursor = parsed.data.next_cursor;
      if (!cursor || cursors.has(cursor)) return failure("FAL billing pagination could not be completed. No partial charge was recorded.");
      cursors.add(cursor); params.set("cursor", cursor);
    }
    return failure("FAL returned too many billing pages. No partial charge was recorded.");
  } catch { return failure("Could not reach FAL billing. This cost remains unconfirmed."); }
}
