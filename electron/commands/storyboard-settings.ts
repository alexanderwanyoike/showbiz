import type { ReadGenerationModels } from "./generation-models";
import { validateStoryboardModels } from "./storyboard-model-validation";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Result } from "../../shared/result";
import type { Storyboard } from "./projects";

const settingsSchema = z.strictObject({
  id: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(1000),
  image_model: z.string().trim().min(1).max(200),
  video_model: z.string().trim().min(1).max(200),
});
export function createStoryboardSettingsCommands(db: DatabaseSync, readGenerationModels: ReadGenerationModels) {
  return {
    update_storyboard_settings(
      args?: Record<string, unknown>,
    ): Result<Storyboard> {
      const parsed = settingsSchema.safeParse(args);
      if (!parsed.success)
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Enter a storyboard name and choose both default models.",
          },
        };
      try {
        const value = parsed.data;
        const models = validateStoryboardModels(readGenerationModels, value.image_model, value.video_model);
        if (!models.ok) return models;
        const updated = db
          .prepare(
            "UPDATE storyboards SET name = ?, image_model = ?, video_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *",
          )
          .get(value.name, value.image_model, value.video_model, value.id);
        if (!updated)
          return {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "The storyboard no longer exists.",
            },
          };
        return { ok: true, value: updated as unknown as Storyboard };
      } catch {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: "Could not save storyboard settings. Try again.",
          },
        };
      }
    },
  };
}
