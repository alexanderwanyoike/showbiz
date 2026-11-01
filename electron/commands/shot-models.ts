import type { ReadGenerationModels } from "./generation-models";
import type { DatabaseSync } from "node:sqlite";
import type {
  ShotModelOverrides,
  ShotModelsResult,
} from "../../shared/shot-models";

export function createShotModelCommands(
  db: DatabaseSync,
  readGenerationModels: ReadGenerationModels,
) {
  return {
    set_shot_models(args?: Record<string, unknown>): ShotModelsResult {
      const fields = ["image_model", "video_model"] as const;
      const selected = fields.filter(
        (field) => args && Object.hasOwn(args, field),
      );
      if (
        typeof args?.shot_id !== "string" ||
        !selected.length ||
        selected.some((field) => {
          const value = args[field];
          return (
            value !== null &&
            (typeof value !== "string" ||
              !value.trim() ||
              value !== value.trim() ||
              value.length > 200)
          );
        })
      )
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Choose a model or use the storyboard default.",
          },
        };
      const catalog = readGenerationModels();
      if (!catalog.ok) return catalog;
      for (const field of selected) {
        const id = args[field];
        if (
          id !== null &&
          !catalog.value.some(
            (model) =>
              model.id === id &&
              model.kind === (field === "image_model" ? "image" : "video"),
          )
        ) {
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: `The selected ${field === "image_model" ? "image" : "video"} model is unavailable. Choose an installed model or use the storyboard default.`,
            },
          };
        }
      }
      const row = db
        .prepare("SELECT id FROM shots WHERE id = ?")
        .get(args.shot_id);
      if (!row)
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "The shot no longer exists." },
        };
      db.prepare(
        `UPDATE shots SET ${selected.map((field) => `${field} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(
        ...selected.map((field) => args[field] as string | null),
        args.shot_id,
      );
      const value = db
        .prepare("SELECT image_model,video_model FROM shots WHERE id = ?")
        .get(args.shot_id) as unknown as ShotModelOverrides;
      return { ok: true, value };
    },
  };
}
