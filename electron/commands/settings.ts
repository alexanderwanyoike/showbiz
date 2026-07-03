import type { DatabaseSync } from "node:sqlite";

export interface ApiKeyStatus {
  provider: string;
  name: string;
  is_configured: boolean;
  source: string | null;
}

/**
 * Providers and their display names, in the exact order the Rust
 * get_api_key_status command lists them.
 */
const PROVIDERS: ReadonlyArray<readonly [string, string]> = [
  ["gemini", "Google AI (Gemini)"],
  ["openai", "OpenAI"],
  ["ltx", "LTX Video"],
  ["kie", "Kie AI"],
  ["fal", "fal.ai"],
  ["replicate", "Replicate"],
];

const dbKeyFor = (provider: string): string => `${provider}_api_key`;

/** Ported settings/API-key commands; names and JSON shapes match src-tauri/src/commands/settings.rs. */
export function createSettingsCommands(db: DatabaseSync) {
  function readValue(provider: string): string | null {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(dbKeyFor(provider)) as { value: string } | undefined;
    return row ? row.value : null;
  }

  return {
    get_api_key(args?: Record<string, unknown>): string | null {
      return readValue(String(args?.provider));
    },

    get_api_key_status(): ApiKeyStatus[] {
      return PROVIDERS.map(([provider, name]) => {
        const configured = readValue(provider) !== null;
        return {
          provider,
          name,
          is_configured: configured,
          source: configured ? "database" : null,
        };
      });
    },

    save_api_key(args?: Record<string, unknown>): void {
      const provider = String(args?.provider);
      const trimmed = String(args?.apiKey ?? "").trim();
      if (trimmed.length === 0) {
        throw new Error("API key cannot be empty");
      }
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      ).run(dbKeyFor(provider), trimmed);
    },

    delete_api_key(args?: Record<string, unknown>): void {
      db.prepare("DELETE FROM settings WHERE key = ?").run(dbKeyFor(String(args?.provider)));
    },
  };
}
