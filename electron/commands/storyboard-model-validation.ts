import type { Result } from "../../shared/result";
import type { ReadGenerationModels } from "./generation-models";

export function validateStoryboardModels(
  readModels: ReadGenerationModels | undefined,
  imageModel: unknown,
  videoModel: unknown,
): Result<null> {
  const catalog = readModels?.();
  if (!catalog)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "The generation model catalog is unavailable.",
      },
    };
  if (!catalog.ok) return catalog;
  for (const [kind, id] of [
    ["image", imageModel],
    ["video", videoModel],
  ] as const) {
    if (!catalog.value.some((model) => model.kind === kind && model.id === id))
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `The selected ${kind} model is unavailable. Choose an installed model.`,
        },
      };
  }
  return { ok: true, value: null };
}
