import { createHash } from "node:crypto";
import { readOpenRouterCharge } from "../provider-billing/openrouter";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readFalCharges } from "../provider-billing/fal";
import type { Result } from "../../shared/result";
import type { GenerationBillingSync } from "../../shared/generation-billing";

const argsSchema = z.strictObject({
  project_id: z.string().min(1).max(256),
  force: z.boolean().optional(),
  request_ids: z.array(z.string().min(1).max(256)).min(1).max(50).optional(),
});
interface PendingCharge {
  request_id: string;
  provider_request_id: string;
  provider: string;
  kind: string;
  started_at: string;
}
export function createGenerationBillingCommands(
  db: DatabaseSync,
  readKey: (provider: string) => string | null,
  http: typeof fetch = fetch,
) {
  const retryAfter = new Map<
    string,
    { credential_id: string | null; until: number; message: string }
  >();
  const inFlight = new Map<string, Promise<Result<GenerationBillingSync>>>();
  async function reconcile(
    parsed: z.infer<typeof argsSchema>,
  ): Promise<Result<GenerationBillingSync>> {
    try {
      const { project_id, request_ids } = parsed;
      const selected = request_ids
        ? ` AND request_id IN (${request_ids.map(() => "?").join(",")})`
        : "";
      const candidates = db
        .prepare(
          `SELECT request_id,provider_request_id,provider,kind,started_at FROM generation_usage WHERE project_id = ? AND reported_microusd IS NULL AND provider_request_id IS NOT NULL AND status != 'running' AND provider IN ('fal','openrouter')${selected} ORDER BY started_at DESC LIMIT 50`,
        )
        .all(project_id, ...(request_ids ?? [])) as unknown as PendingCharge[];
      const credentials = new Map<string, string | null>();
      if (candidates.some((row) => row.provider === "fal"))
        credentials.set("fal", readKey("fal-billing") ?? readKey("fal"));
      if (candidates.some((row) => row.provider === "openrouter"))
        credentials.set("openrouter", readKey("openrouter"));
      const credentialIds = new Map([...credentials].map(([provider, key]) => [provider, key ? createHash("sha256").update(key).digest("hex") : null]));
      const notes: GenerationBillingSync["notes"] = [];
      const identity = (row: PendingCharge) =>
        JSON.stringify([project_id, row.request_id]);
      const rows = candidates.filter((row) => {
        const cached = retryAfter.get(identity(row));
        if (
          !parsed.force &&
          cached &&
          cached.credential_id === credentialIds.get(row.provider) &&
          cached.until > Date.now()
        ) {
          notes.push({ request_id: row.request_id, message: cached.message });
          return false;
        }
        return true;
      });
      const result: GenerationBillingSync = {
        checked: rows.length,
        reported: 0,
        notes,
      };
      const fal = rows.filter((row) => row.provider === "fal");
      if (fal.length) {
        const key = credentials.get("fal") ?? null;
        if (!key)
          result.notes.push(
            ...fal.map((row) => ({
              request_id: row.request_id,
              message:
                "Add a FAL key in Settings to check the provider's actual charge.",
            })),
          );
        else {
          const groups = new Map<number, PendingCharge[]>();
          for (const row of fal) {
            const bucket = Math.floor(
              Date.parse(row.started_at) / (89 * 24 * 60 * 60 * 1000),
            );
            groups.set(bucket, [...(groups.get(bucket) ?? []), row]);
          }
          for (const requests of groups.values()) {
            const charges = await readFalCharges(requests, key, http);
            for (const row of requests) {
              const amount = charges.ok
                ? charges.value.get(row.provider_request_id)
                : undefined;
              if (amount !== undefined) {
                const stored = db
                  .prepare(
                    "UPDATE generation_usage SET reported_microusd = ? WHERE request_id = ? AND project_id = ? AND reported_microusd IS NULL",
                  )
                  .run(amount, row.request_id, project_id);
                result.reported += Number(stored.changes);
              } else
                result.notes.push({
                  request_id: row.request_id,
                  message: charges.ok
                    ? "FAL did not return a billing event for this request. Its charge remains unconfirmed."
                    : charges.error.message,
                });
            }
          }
        }
      }
      const openrouter = rows.filter((row) => row.provider === "openrouter");
      const key = credentials.get("openrouter") ?? null;
      for (let index = 0; index < openrouter.length; index += 4) {
        await Promise.all(
          openrouter.slice(index, index + 4).map(async (row) => {
            if (!key) {
              result.notes.push({
                request_id: row.request_id,
                message:
                  "Add an OpenRouter key in Settings to check the provider's actual charge.",
              });
              return;
            }
            const charge = await readOpenRouterCharge(
              row.provider_request_id,
              row.kind,
              key,
              http,
            );
            if (charge.ok && charge.value !== null) {
              const stored = db
                .prepare(
                  "UPDATE generation_usage SET reported_microusd = ? WHERE request_id = ? AND project_id = ? AND reported_microusd IS NULL",
                )
                .run(charge.value, row.request_id, project_id);
              result.reported += Number(stored.changes);
            } else
              result.notes.push({
                request_id: row.request_id,
                message: charge.ok
                  ? "OpenRouter did not return a final charge for this request. Its cost remains unconfirmed."
                  : charge.error.message,
              });
          }),
        );
      }
      for (const row of rows) {
        const note = result.notes.find(
          (entry) => entry.request_id === row.request_id,
        );
        if (!note) {
          retryAfter.delete(identity(row));
          continue;
        }
        retryAfter.set(identity(row), {
          credential_id: credentialIds.get(row.provider) ?? null,
          until: Date.now() + 60000,
          message: note.message,
        });
      }
      while (retryAfter.size > 500) {
        const oldest = retryAfter.keys().next().value;
        if (oldest !== undefined) retryAfter.delete(oldest);
      }
      return { ok: true, value: result };
    } catch {
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            "Could not reconcile provider charges. Existing receipts and estimates were preserved.",
        },
      };
    }
  }
  return {
    async sync_generation_charges(
      args?: Record<string, unknown>,
    ): Promise<Result<GenerationBillingSync>> {
      const parsed = argsSchema.safeParse(args);
      if (!parsed.success)
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message:
              "Choose a project and up to 50 generation requests to check.",
          },
        };
      const identity = JSON.stringify([
        parsed.data.project_id,
        parsed.data.request_ids ? [...parsed.data.request_ids].sort() : null,
      ]);
      const existing = inFlight.get(identity);
      if (existing) return existing;
      const operation = reconcile(parsed.data);
      inFlight.set(identity, operation);
      try {
        return await operation;
      } finally {
        if (inFlight.get(identity) === operation) inFlight.delete(identity);
      }
    },
  };
}
