import type { DatabaseSync } from "node:sqlite";
import type { Result } from "../../shared/result";

export function createShotFrameCommands(db: DatabaseSync) {
  return {
    clear_shot_start_frame(args?: Record<string, unknown>): Result<null> {
      if (
        typeof args?.shot_id !== "string" ||
        !args.shot_id ||
        args.shot_id.length > 256
      )
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Choose a shot to remove its start frame.",
          },
        };
      let started = false;
      try {
        if (!db.prepare("SELECT id FROM shots WHERE id = ?").get(args.shot_id))
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "The shot no longer exists." },
          };
        db.exec("BEGIN IMMEDIATE");
        started = true;
        db.prepare(
          "UPDATE shots SET image_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(args.shot_id);
        db.prepare(
          "UPDATE image_versions SET is_current = 0 WHERE shot_id = ?",
        ).run(args.shot_id);
        db.exec("COMMIT");
        started = false;
        return { ok: true, value: null };
      } catch {
        if (started) {
          try {
            db.exec("ROLLBACK");
          } catch (error) {
            console.error(
              "Could not roll back a frame selection change:",
              error,
            );
          }
        }
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: "Could not remove the start frame selection.",
          },
        };
      }
    },
  };
}
