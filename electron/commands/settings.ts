import type { DatabaseSync } from "node:sqlite";
import {
  API_KEY_PROVIDERS,
  parseApiKeyProvider,
  type ApiKeyProvider,
} from "../../shared/provider-catalog";

export interface ApiKeyStatus {
  provider: ApiKeyProvider;
  name: string;
  is_configured: boolean;
  source: string | null;
}

const dbKeyFor = (provider: ApiKeyProvider): string => `${provider}_api_key`;

/** Ported settings/API-key commands; names and JSON shapes match the retired Rust backend's commands/settings.rs. */
export function createSettingsCommands(db: DatabaseSync) {
  function readValue(provider: ApiKeyProvider): string | null {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(dbKeyFor(provider)) as { value: string } | undefined;
    return row ? row.value : null;
  }

  return {
    get_api_key(args?: Record<string, unknown>): string | null {
      return readValue(parseApiKeyProvider(args?.provider));
    },

    get_api_key_status(): ApiKeyStatus[] {
      return API_KEY_PROVIDERS.map(({ id, name }) => {
        const configured = readValue(id) !== null;
        return {
          provider: id,
          name,
          is_configured: configured,
          source: configured ? "database" : null,
        };
      });
    },

    save_api_key(args?: Record<string, unknown>): void {
      const provider = parseApiKeyProvider(args?.provider);
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
      const provider = parseApiKeyProvider(args?.provider);
      db.prepare("DELETE FROM settings WHERE key = ?").run(dbKeyFor(provider));
    },
  };
}
