import { generationPriceSchema } from "../../shared/generation-price-schema";
import type { DatabaseSync } from "node:sqlite";
import type {
  GenerationUsage,
  GenerationCostSummary,
} from "../../shared/generation-usage";
import type { Result } from "../../shared/result";

type Args = Record<string, unknown>;
type UsageRow = Omit<GenerationUsage, "settings" | "price_basis"> & {
  settings_json: string;
  price_basis_json: string | null;
};
const success = <T>(value: T): Result<T> => ({ ok: true, value });
const invalid = (message: string): Result<never> => ({
  ok: false,
  error: { code: "INVALID_INPUT", message },
});
const money = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
const kinds = new Set(["image", "image_edit", "image_compose", "video"]);

function familyFilter(family: "image" | "video" | null) {
  if (family === "video") return " AND kind = 'video'";
  if (family === "image")
    return " AND kind IN ('image','image_edit','image_compose')";
  return "";
}

export function recoverInterruptedGenerationUsage(db: DatabaseSync): void {
  db.prepare(
    "UPDATE generation_usage SET status = 'interrupted', finished_at = ? WHERE status = 'running'",
  ).run(new Date().toISOString());
}

export function createGenerationUsageCommands(db: DatabaseSync) {
  function execute<T>(action: () => Result<T>): Result<T> {
    try {
      return action();
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            cause instanceof Error
              ? cause.message
              : "Could not update generation usage.",
        },
      };
    }
  }
  function usage(requestId: unknown): UsageRow | undefined {
    return identifier(requestId)
      ? (db
          .prepare("SELECT * FROM generation_usage WHERE request_id = ?")
          .get(requestId) as UsageRow | undefined)
      : undefined;
  }
  function items(
    projectId: string,
    limit: number,
    offset: number,
    subject: string | null,
    family: "image" | "video" | null,
  ): GenerationUsage[] {
    return (
      db
        .prepare(
          `SELECT * FROM generation_usage WHERE project_id = ? AND (? IS NULL OR subject_id = ?)${familyFilter(family)} ORDER BY started_at DESC, request_id LIMIT ? OFFSET ?`,
        )
        .all(projectId, subject, subject, limit, offset) as UsageRow[]
    ).map(({ settings_json, price_basis_json, ...row }) => ({
      price_basis: price_basis_json
        ? generationPriceSchema.parse(JSON.parse(price_basis_json))
        : null,
      ...row,
      settings: JSON.parse(settings_json) as GenerationUsage["settings"],
    }));
  }
  return {
    begin_generation_usage: (args: Args = {}): Result<GenerationUsage> =>
      execute(() => {
        if (
          ![
            args.request_id,
            args.project_id,
            args.provider,
            args.model_id,
          ].every(identifier) ||
          typeof args.kind !== "string" ||
          !kinds.has(args.kind)
        )
          return invalid(
            "Choose a project, provider, model and generation kind.",
          );
        if (
          !db
            .prepare("SELECT id FROM projects WHERE id = ?")
            .get(args.project_id as string)
        )
          return invalid("The project does not exist.");
        if (usage(args.request_id))
          return invalid("This generation request has already started.");
        const subject = args.subject_id ?? null;
        if (subject !== null && !identifier(subject))
          return invalid("The generation subject is invalid.");
        const basis =
          args.price_basis == null
            ? null
            : generationPriceSchema.safeParse(args.price_basis);
        if (
          basis &&
          (!basis.success ||
            basis.data.provider !== args.provider ||
            basis.data.model_id !== args.model_id)
        )
          return invalid(
            "The quoted price basis does not match the provider and model.",
          );
        const price = basis?.success ? basis.data : null;
        const min = args.estimated_min_microusd ?? null;
        const max = args.estimated_max_microusd ?? null;
        if (
          (min !== null || max !== null) &&
          (!money(min) || !money(max) || max < min)
        )
          return invalid("The estimated cost is invalid.");
        const settings = args.settings ?? {};
        if (
          typeof settings !== "object" ||
          settings === null ||
          Array.isArray(settings) ||
          Object.keys(settings).length > 20 ||
          Object.entries(settings).some(
            ([key, value]) =>
              ![
                "duration",
                "resolution",
                "audio",
                "aspect_ratio",
                "width",
                "height",
                "count",
                "mode",
                "has_end_frame",
              ].includes(key) ||
              !["string", "number", "boolean"].includes(typeof value) ||
              (typeof value === "string" && value.length > 128) ||
              (typeof value === "number" && !Number.isFinite(value)),
          )
        )
          return invalid("Generation settings contain unsupported values.");
        if (
          args.price_source !== undefined ||
          args.price_checked_at !== undefined
        )
          return invalid(
            "Supply pricing provenance only through the price basis.",
          );
        const source = price?.source_url ?? null;
        const checked = price?.checked_at ?? null;
        db.prepare(
          `INSERT INTO generation_usage(request_id,project_id,subject_id,price_basis_json,kind,provider,model_id,settings_json,estimated_min_microusd,estimated_max_microusd,price_source,price_checked_at,started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          args.request_id as string,
          args.project_id as string,
          subject as string | null,
          price ? JSON.stringify(price) : null,
          args.kind,
          args.provider as string,
          args.model_id as string,
          JSON.stringify(settings),
          min as number | null,
          max as number | null,
          source,
          checked,
          new Date().toISOString(),
        );
        const row = usage(args.request_id)!;
        const { settings_json, price_basis_json, ...value } = row;
        return success({
          ...value,
          price_basis: price,
          settings: JSON.parse(settings_json) as GenerationUsage["settings"],
        });
      }),
    record_generation_receipt: (args: Args = {}): Result<null> =>
      execute(() => {
        if (
          (args.reported_microusd !== null && !money(args.reported_microusd)) ||
          (args.reported_microusd === null &&
            !identifier(args.provider_request_id)) ||
          (args.provider_request_id != null &&
            !identifier(args.provider_request_id))
        )
          return invalid("The reported provider charge is invalid.");
        const row = usage(args.request_id);
        if (!row) return invalid("The generation request does not exist.");
        if (
          row.reported_microusd !== null &&
          (row.reported_microusd !== args.reported_microusd ||
            row.provider_request_id !== (args.provider_request_id ?? null))
        )
          return invalid("A different provider receipt is already recorded.");
        db.prepare(
          "UPDATE generation_usage SET reported_microusd = ?, provider_request_id = ? WHERE request_id = ?",
        ).run(
          args.reported_microusd,
          (args.provider_request_id as string) ?? null,
          row.request_id,
        );
        return success(null);
      }),
    finish_generation_usage: (args: Args = {}): Result<null> =>
      execute(() => {
        if (
          typeof args.status !== "string" ||
          !["completed", "failed", "cancelled", "interrupted"].includes(
            args.status,
          )
        )
          return invalid("The generation outcome is invalid.");
        const row = usage(args.request_id);
        if (!row) return invalid("The generation request does not exist.");
        if (row.status !== "running" && row.status !== args.status)
          return invalid("This generation already has a final outcome.");
        db.prepare(
          "UPDATE generation_usage SET status = ?, finished_at = COALESCE(finished_at, ?) WHERE request_id = ?",
        ).run(args.status, new Date().toISOString(), row.request_id);
        return success(null);
      }),
    get_generation_usage: (
      args: Args = {},
    ): Result<{ items: GenerationUsage[]; total_count: number }> =>
      execute(() => {
        if (!identifier(args.project_id))
          return invalid("Choose a project to view usage.");
        const subject = args.subject_id ?? null;
        if (subject !== null && !identifier(subject))
          return invalid("The generation subject is invalid.");
        const family = args.kind_family ?? null;
        if (family !== null && family !== "image" && family !== "video")
          return invalid("Choose a valid generation family.");
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;
        if (
          !Number.isSafeInteger(limit) ||
          Number(limit) < 1 ||
          Number(limit) > 100 ||
          !Number.isSafeInteger(offset) ||
          Number(offset) < 0
        )
          return invalid("The usage page is invalid.");
        const total = db
          .prepare(
            `SELECT COUNT(*) AS count FROM generation_usage WHERE project_id = ? AND (? IS NULL OR subject_id = ?)${familyFilter(family)}`,
          )
          .get(
            args.project_id,
            subject as string | null,
            subject as string | null,
          ) as { count: number };
        return success({
          items: items(
            args.project_id,
            Number(limit),
            Number(offset),
            subject as string | null,
            family,
          ),
          total_count: total.count,
        });
      }),
    get_generation_cost_summary: (
      args: Args = {},
    ): Result<GenerationCostSummary> =>
      execute(() => {
        if (!identifier(args.project_id))
          return invalid("Choose a project to view costs.");
        const subject = args.subject_id ?? null;
        if (subject !== null && !identifier(subject))
          return invalid("The generation subject is invalid.");
        const summary = db
          .prepare(
            `SELECT
        COALESCE(SUM(reported_microusd), 0) AS reported_microusd,
        COALESCE(SUM(CASE WHEN reported_microusd IS NULL THEN estimated_min_microusd ELSE 0 END), 0) AS estimated_min_microusd,
        COALESCE(SUM(CASE WHEN reported_microusd IS NULL THEN estimated_max_microusd ELSE 0 END), 0) AS estimated_max_microusd,
        COALESCE(SUM(CASE WHEN reported_microusd IS NULL AND estimated_min_microusd IS NULL THEN 1 ELSE 0 END), 0) AS unknown_count,
        COUNT(*) AS total_count
        FROM generation_usage WHERE project_id = ? AND (? IS NULL OR subject_id = ?)`,
          )
          .get(
            args.project_id,
            subject as string | null,
            subject as string | null,
          ) as unknown as GenerationCostSummary;
        return Object.values(summary).every(Number.isSafeInteger)
          ? success(summary)
          : invalid("The usage total exceeds the supported amount.");
      }),
  };
}
