import { z } from "zod";

export const shotVideoSettingsSchema = z.strictObject({
  model_id: z.string().trim().min(1).max(200),
  settings: z.strictObject({
    duration: z.string().max(16).refine((value) => value === "auto" || (/^\d+s?$/.test(value) && Number(value.replace(/s$/,"")) > 0 && Number(value.replace(/s$/,"")) <= 3600)),
    resolution: z.string().min(1).max(32).optional(),
    aspect_ratio: z.string().min(1).max(32).optional(),
    audio: z.boolean().optional(),
  }),
});
export type StoredShotVideoSettings = z.infer<typeof shotVideoSettingsSchema>;
