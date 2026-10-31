import { z } from "zod";

export const generationPriceSchema = z.strictObject({
  provider: z.string().min(1).max(256),
  model_id: z.string().min(1).max(256),
  currency: z.literal("USD"),
  source_kind: z.enum(["provider", "manual"]).optional(),
  source_url: z
    .url()
    .max(2048)
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  checked_at: z.iso.datetime(),
  excludes_input_cost: z.boolean().optional(),
  rates: z
    .array(
      z.strictObject({
        unit: z.enum(["image", "second", "megapixel"]),
        microusd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        max_microusd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        resolution: z.string().max(128).optional(),
        audio: z.boolean().optional(),
        kind: z
          .enum(["image", "image_edit", "image_compose", "video"])
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
