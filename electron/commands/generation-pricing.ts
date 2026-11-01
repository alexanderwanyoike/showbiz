import type { DatabaseSync } from "node:sqlite";
import {
  generationPriceSchema,
  generationRateScopeSchema,
} from "../../shared/generation-price-schema";
import { providerPrices } from "../../shared/provider-prices";
import {
  generationRateSignature,
  type GenerationPrice,
} from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

type Args = Record<string, unknown>;
const invalid = (): Result<never> => ({
  ok: false,
  error: {
    code: "INVALID_INPUT",
    message: "Choose a model, generation kind and valid USD price basis.",
  },
});
const kindValid = (value: unknown): value is string =>
  typeof value === "string" &&
  ["image", "image_edit", "image_compose", "video"].includes(value);
const idValid = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
export function createGenerationPricingCommands(db: DatabaseSync) {
  function run<T>(operation: () => Result<T>): Result<T> {
    try {
      return operation();
    } catch {
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message: "Could not read or save generation pricing on this device.",
        },
      };
    }
  }
  function read(key: string): GenerationPrice | null {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? generationPriceSchema.parse(JSON.parse(row.value)) : null;
  }
  return {
    get_generation_price(args: Args = {}): Result<GenerationPrice | null> {
      return run(() => {
        if (!idValid(args.model_id) || !kindValid(args.kind)) return invalid();
        if (
          args.include_manual !== undefined &&
          typeof args.include_manual !== "boolean"
        )
          return invalid();
        const suffix = `${args.kind}:${args.model_id}`;
        return {
          ok: true,
          value:
            (args.include_manual === false
              ? null
              : read(`generation_price:${suffix}`)) ??
            read(`generation_price_cache:${suffix}`) ??
            providerPrices.find((price) => price.model_id === args.model_id) ??
            null,
        };
      });
    },
    save_generation_price(args: Args = {}): Result<GenerationPrice> {
      return run(() => {
        const parsed = generationPriceSchema.safeParse(args.price);
        if (!kindValid(args.kind) || !parsed.success) return invalid();
        const price = parsed.data;
        const prefix =
          price.source_kind === "manual"
            ? "generation_price"
            : "generation_price_cache";
        if (price.source_kind === "manual") {
          const previous = read(`${prefix}:${args.kind}:${price.model_id}`);
          const updated = new Set(price.rates.map(generationRateSignature));
          const retained =
            previous?.provider === price.provider
              ? previous.rates.filter(
                  (rate) => !updated.has(generationRateSignature(rate)),
                )
              : [];
          const combined = generationPriceSchema.safeParse({
            ...price,
            rates: [...retained, ...price.rates],
          });
          if (!combined.success) return invalid();
          price.rates = combined.data.rates;
        }
        db.prepare(
          "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        ).run(
          `${prefix}:${args.kind}:${price.model_id}`,
          JSON.stringify(price),
        );
        return { ok: true, value: price };
      });
    },
    clear_generation_price(args: Args = {}): Result<null> {
      return run(() => {
        if (!idValid(args.model_id) || !kindValid(args.kind)) return invalid();
        const scope = generationRateScopeSchema.safeParse(args.rate_scope);
        if (!scope.success) return invalid();
        const key = `generation_price:${args.kind}:${args.model_id}`;
        const previous = read(key);
        if (!previous) return { ok: true, value: null };
        const signature = generationRateSignature(scope.data);
        const rates = previous.rates.filter(
          (rate) => generationRateSignature(rate) !== signature,
        );
        if (rates.length)
          db.prepare(
            "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
          ).run(JSON.stringify({ ...previous, rates }), key);
        else db.prepare("DELETE FROM settings WHERE key = ?").run(key);
        return { ok: true, value: null };
      });
    },
  };
}
