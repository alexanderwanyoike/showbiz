import type { DatabaseSync } from "node:sqlite";
import { generationPriceSchema } from "../../shared/generation-price-schema";
import { providerPrices } from "../../shared/provider-prices";
import type { GenerationPrice } from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

type Args = Record<string, unknown>;
const invalid = (): Result<never> => ({ok: false, error: {code: "INVALID_INPUT", message: "Choose a model, generation kind and valid USD price basis."}});
const kindValid = (value: unknown): value is string => typeof value === "string" && ["image", "image_edit", "image_compose", "video"].includes(value);
const idValid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
export function createGenerationPricingCommands(db: DatabaseSync) {
  function run<T>(operation: () => Result<T>): Result<T> {
    try { return operation(); } catch { return {ok: false, error: {code: "IO_ERROR", message: "Could not read or save generation pricing on this device."}}; }
  }
  function read(key: string): GenerationPrice | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as {value: string} | undefined;
    return row ? generationPriceSchema.parse(JSON.parse(row.value)) : null;
  }
  return {
    get_generation_price(args: Args = {}): Result<GenerationPrice | null> {
      return run(() => {
        if (!idValid(args.model_id) || !kindValid(args.kind)) return invalid();
        const suffix = `${args.kind}:${args.model_id}`;
        return {ok: true, value: read(`generation_price:${suffix}`) ?? read(`generation_price_cache:${suffix}`) ?? providerPrices.find(price => price.model_id === args.model_id) ?? null};
      });
    },
    save_generation_price(args: Args = {}): Result<GenerationPrice> {
      return run(() => {
        const parsed = generationPriceSchema.safeParse(args.price);
        if (!kindValid(args.kind) || !parsed.success) return invalid();
        const price = parsed.data;
        const prefix = price.source_kind === "manual" ? "generation_price" : "generation_price_cache";
        if (price.source_kind === "manual") {
          const previous = read(`${prefix}:${args.kind}:${price.model_id}`);
          const signature = (rate: GenerationPrice["rates"][number]) => JSON.stringify([rate.unit, rate.kind ?? null, rate.resolution ?? null, rate.audio ?? null]);
          const updated = new Set(price.rates.map(signature));
          const retained = previous?.provider === price.provider ? previous.rates.filter(rate => !updated.has(signature(rate))) : [];
          const combined = generationPriceSchema.safeParse({...price, rates: [...retained, ...price.rates]});
          if (!combined.success) return invalid();
          price.rates = combined.data.rates;
        }
        db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").run(`${prefix}:${args.kind}:${price.model_id}`, JSON.stringify(price));
        return {ok: true, value: price};
      });
    },
    clear_generation_price(args: Args = {}): Result<null> {
      return run(() => {
        if (!idValid(args.model_id) || !kindValid(args.kind)) return invalid();
        db.prepare("DELETE FROM settings WHERE key = ?").run(`generation_price:${args.kind}:${args.model_id}`);
        return {ok: true, value: null};
      });
    },
  };
}
