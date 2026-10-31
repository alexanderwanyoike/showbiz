import type { DatabaseSync } from "node:sqlite";
import type { GenerationUsage, GenerationCostSummary } from "../../shared/generation-usage";
import type { Result } from "../../shared/result";

type Args = Record<string, unknown>;
type UsageRow = Omit<GenerationUsage, "settings"> & { settings_json: string };
const success = <T>(value: T): Result<T> => ({ ok: true, value });
const invalid = (message: string): Result<never> => ({ ok: false, error: { code: "INVALID_INPUT", message } });
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
const kinds = new Set(["image", "image_edit", "image_compose", "video"]);

export function createGenerationUsageCommands(db: DatabaseSync) {
  function execute<T>(action: () => Result<T>): Result<T> {
    try { return action(); }
    catch (cause) { return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : "Could not update generation usage." } }; }
  }
  function usage(requestId: unknown): UsageRow | undefined {
    return identifier(requestId) ? db.prepare("SELECT * FROM generation_usage WHERE request_id = ?").get(requestId) as UsageRow | undefined : undefined;
  }
  function items(projectId: string): GenerationUsage[] {
    return (db.prepare("SELECT * FROM generation_usage WHERE project_id = ? ORDER BY started_at DESC, request_id").all(projectId) as UsageRow[]).map(({ settings_json, ...row }) => ({ ...row, settings: JSON.parse(settings_json) as GenerationUsage["settings"] }));
  }
  return {
    begin_generation_usage: (args: Args): Result<GenerationUsage> => execute(() => {
      if (![args.request_id, args.project_id, args.provider, args.model_id].every(identifier) || typeof args.kind !== "string" || !kinds.has(args.kind)) return invalid("Choose a project, provider, model and generation kind.");
      if (!db.prepare("SELECT id FROM projects WHERE id = ?").get(args.project_id as string)) return invalid("The project does not exist.");
      if (usage(args.request_id)) return invalid("This generation request has already started.");
      const min = args.estimated_min_microusd ?? null;
      const max = args.estimated_max_microusd ?? null;
      if ((min !== null || max !== null) && (!money(min) || !money(max) || max < min)) return invalid("The estimated cost is invalid.");
      const settings = args.settings ?? {};
      if (typeof settings !== "object" || settings === null || Array.isArray(settings) || Object.keys(settings).length > 20 || Object.entries(settings).some(([key, value]) => !["duration", "resolution", "audio", "aspect_ratio", "width", "height", "count", "mode"].includes(key) || !["string", "number", "boolean"].includes(typeof value) || (typeof value === "string" && value.length > 128) || (typeof value === "number" && !Number.isFinite(value)))) return invalid("Generation settings contain unsupported values.");
      const source = typeof args.price_source === "string" && args.price_source.length <= 2048 ? args.price_source : null;
      const checked = typeof args.price_checked_at === "string" && Number.isFinite(Date.parse(args.price_checked_at)) ? args.price_checked_at : null;
      db.prepare(`INSERT INTO generation_usage(request_id,project_id,kind,provider,model_id,settings_json,estimated_min_microusd,estimated_max_microusd,price_source,price_checked_at,started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(args.request_id as string, args.project_id as string, args.kind, args.provider as string, args.model_id as string, JSON.stringify(settings), min as number | null, max as number | null, source, checked, new Date().toISOString());
      const row = usage(args.request_id)!;
      const { settings_json, ...value } = row;
      return success({ ...value, settings: JSON.parse(settings_json) as GenerationUsage["settings"] });
    }),
    record_generation_receipt: (args: Args): Result<null> => execute(() => {
      if (!money(args.reported_microusd) || (args.provider_request_id != null && !identifier(args.provider_request_id))) return invalid("The reported provider charge is invalid.");
      const row = usage(args.request_id);
      if (!row) return invalid("The generation request does not exist.");
      if (row.reported_microusd !== null && (row.reported_microusd !== args.reported_microusd || row.provider_request_id !== (args.provider_request_id ?? null))) return invalid("A different provider receipt is already recorded.");
      db.prepare("UPDATE generation_usage SET reported_microusd = ?, provider_request_id = ? WHERE request_id = ?").run(args.reported_microusd, args.provider_request_id as string ?? null, row.request_id);
      return success(null);
    }),
    finish_generation_usage: (args: Args): Result<null> => execute(() => {
      if (typeof args.status !== "string" || !["completed", "failed", "cancelled", "interrupted"].includes(args.status)) return invalid("The generation outcome is invalid.");
      const row = usage(args.request_id);
      if (!row) return invalid("The generation request does not exist.");
      if (row.status !== "running" && row.status !== args.status) return invalid("This generation already has a final outcome.");
      db.prepare("UPDATE generation_usage SET status = ?, finished_at = COALESCE(finished_at, ?) WHERE request_id = ?").run(args.status, new Date().toISOString(), row.request_id);
      return success(null);
    }),
    get_generation_usage: (args: Args): Result<{ items: GenerationUsage[] }> => execute(() => identifier(args.project_id) ? success({ items: items(args.project_id) }) : invalid("Choose a project to view usage.")),
    get_generation_cost_summary: (args: Args): Result<GenerationCostSummary> => execute(() => {
      if (!identifier(args.project_id)) return invalid("Choose a project to view costs.");
      const rows = items(args.project_id);
      const summary: GenerationCostSummary = { reported_microusd: 0, estimated_min_microusd: 0, estimated_max_microusd: 0, unknown_count: 0, total_count: rows.length };
      for (const row of rows) {
        if (row.reported_microusd !== null) summary.reported_microusd += row.reported_microusd;
        else if (row.estimated_min_microusd !== null && row.estimated_max_microusd !== null) {
          summary.estimated_min_microusd += row.estimated_min_microusd;
          summary.estimated_max_microusd += row.estimated_max_microusd;
        } else summary.unknown_count += 1;
      }
      return success(summary);
    }),
  };
}
