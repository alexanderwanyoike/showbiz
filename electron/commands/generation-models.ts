import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  validateImageConfig,
  validateVideoConfig,
  type VideoModelCapabilities,
  type VideoGenerationSettings,
} from "../../shared/model-config";
import type { Result } from "../../shared/result";

export interface GenerationModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  kind: "image" | "video";
  capabilities?: VideoModelCapabilities;
  defaults?: VideoGenerationSettings;
  supportsEditing?: boolean;
  supportsComposition?: boolean;
}
export type ReadGenerationModels = () => Result<GenerationModel[]>;

export function createGenerationModelCommands(directory: string) {
  return {
    get_generation_models(): Result<GenerationModel[]> {
      let source = directory;
      try {
        const models: GenerationModel[] = [];
        for (const kind of ["image", "video"] as const) {
          const folder = path.join(directory, kind);
          source = folder;
          for (const filename of readdirSync(folder)
            .filter((file) => file.endsWith(".json"))
            .sort()) {
            source = path.join(folder, filename);
            const raw: unknown = JSON.parse(readFileSync(source, "utf8"));
            const parsed =
              kind === "image"
                ? validateImageConfig(raw)
                : validateVideoConfig(raw);
            if (!parsed.enabled) continue;
            const metadata: GenerationModel = {
              id: parsed.id,
              name: parsed.name,
              description: parsed.description,
              provider: parsed.apiKeyProvider,
              kind,
            };
            if ("capabilities" in parsed) {
              metadata.capabilities = parsed.capabilities;
              metadata.defaults = parsed.defaults;
            } else {
              metadata.supportsEditing = parsed.supportsEditing;
              metadata.supportsComposition = parsed.supportsComposition;
            }
            models.push(metadata);
          }
        }
        return { ok: true, value: models };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: `Could not read generation model catalog ${source}: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    },
  };
}
