import { z } from "zod";

export const generationRateScopeSchema = z.strictObject({
  unit: z.enum(["image", "second", "megapixel", "request"]),
  resolution: z.string().max(128).optional(),
  audio: z.boolean().optional(),
  kind: z.enum(["image", "image_edit", "image_compose", "video"]).optional(),
});

export const generationPriceSchema = z
  .strictObject({
    provider: z.string().min(1).max(256),
    model_id: z.string().min(1).max(256),
    currency: z.literal("USD"),
    source_kind: z.enum(["provider", "published", "manual"]).optional(),
    source_url: z.union([
      z.literal(""),
      z
        .url()
        .max(2048)
        .refine((value) => /^https?:/i.test(value)),
    ]),
    checked_at: z.iso.datetime(),
    endpoint_id: z.string().min(1).max(256).optional(),
    estimate_basis: z.literal("historical_request").optional(),
    billing_unit: z.string().min(1).max(128).optional(),
    billing_unit_microusd: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    excludes_input_cost: z.boolean().optional(),
    rates: z
      .array(
        generationRateScopeSchema.extend({
          microusd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          max_microusd: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER)
            .optional(),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (price) => price.source_kind === "manual" || !!price.source_url,
    "Provider rates require a source URL.",
  );

export const microusdSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const priceFreshnessSchema = z.enum(["live", "cached", "stale"]);
export const generationCostRequestSchema = z.strictObject({
  kind: z.enum(["image", "image_edit", "image_compose", "video"]),
  duration: z.union([z.number().positive(), z.string().max(32)]).optional(),
  duration_range: z.tuple([z.number().positive(), z.number().positive()]).optional(),
  resolution: z.string().max(128).optional(),
  audio: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  count: z.number().int().positive().optional(),
  aspect_ratio: z.string().max(32).optional(),
  mode: z.string().max(64).optional(),
  has_end_frame: z.boolean().optional(),
});
