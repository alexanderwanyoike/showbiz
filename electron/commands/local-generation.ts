import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_LOCAL_GENERATION, localGenerationSchema, type LocalGenerationConfig } from "../../shared/local-generation";
import type { Result } from "../../shared/result";

export function createLocalGenerationCommands(db: DatabaseSync) {
  return {
    get_local_generation_config(): Result<LocalGenerationConfig> {
      try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'local_generation_config'").get() as { value: string } | undefined;
        const parsed = localGenerationSchema.safeParse(row ? JSON.parse(row.value) : DEFAULT_LOCAL_GENERATION);
        return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: { code: "INVALID_INPUT", message: "The saved local generation configuration is invalid. Update it in Settings." } };
      } catch { return { ok: false, error: { code: "IO_ERROR", message: "Could not read local generation settings." } }; }
    },
    set_local_generation_config(args?: Record<string, unknown>): Result<LocalGenerationConfig> {
      const parsed = localGenerationSchema.safeParse(args);
      if (!parsed.success) return { ok: false, error: { code: "INVALID_INPUT", message: "Choose a valid server URL and model names. Credentials belong in the optional API key field." } };
      try {
        db.prepare("INSERT INTO settings(key,value) VALUES ('local_generation_config',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").run(JSON.stringify(parsed.data));
        return { ok: true, value: parsed.data };
      } catch { return { ok: false, error: { code: "IO_ERROR", message: "Could not save local generation settings." } }; }
    },
  };
}
