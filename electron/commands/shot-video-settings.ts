import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  shotVideoSettingsSchema,
  type StoredShotVideoSettings,
} from "../../shared/shot-video-settings";
import type { Result } from "../../shared/result";

const requestSchema = shotVideoSettingsSchema.extend({
  shot_id: z.string().min(1).max(256),
});
export function createShotVideoSettingsCommands(db: DatabaseSync) {
  return {
    set_shot_video_settings(
      args?: Record<string, unknown>,
    ): Result<StoredShotVideoSettings> {
      const parsed = requestSchema.safeParse(args);
      if (!parsed.success)
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Choose valid video settings for this shot.",
          },
        };
      const { shot_id, ...value } = parsed.data;
      try {
        const changed = db
          .prepare(
            "UPDATE shots SET video_settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .run(JSON.stringify(value), shot_id);
        return changed.changes
          ? { ok: true, value }
          : {
              ok: false,
              error: {
                code: "NOT_FOUND",
                message: "The shot no longer exists.",
              },
            };
      } catch {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: "Could not save this shot's video settings.",
          },
        };
      }
    },
  };
}
