import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Result } from "../../shared/result";

const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  apiKeyProvider: z.string(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  supportsEditing: z.boolean().optional(),
  supportsComposition: z.boolean().optional(),
});
type GenerationModel = Omit<
  z.infer<typeof modelSchema>,
  "apiKeyProvider" | "enabled"
> & {
  provider: string;
  kind: "image" | "video";
};
export function createGenerationModelCommands(directory: string) {
  return {
    get_generation_models(): Result<GenerationModel[]> {
      try {
        const models: GenerationModel[] = [];
        for (const kind of ["image", "video"] as const) {
          const folder = path.join(directory, kind);
          for (const filename of readdirSync(folder)
            .filter((file) => file.endsWith(".json"))
            .sort()) {
            const parsed = modelSchema.parse(
              JSON.parse(readFileSync(path.join(folder, filename), "utf8")),
            );
            if (!parsed.enabled) continue;
            const { apiKeyProvider, enabled, ...metadata } = parsed;
            models.push({ ...metadata, provider: apiKeyProvider, kind });
          }
        }
        return { ok: true, value: models };
      } catch {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: "Could not read the installed generation model catalog.",
          },
        };
      }
    },
  };
}
