import { createGenerationPricingCommands } from "./generation-pricing";
import { createLocalGenerationCommands } from "./local-generation";
import type { DatabaseSync } from "node:sqlite";
import {
  API_KEY_PROVIDERS,
  parseApiKeyProvider,
  type ApiKeyProvider,
  type ApiKeyStatus,
} from "../../shared/provider-catalog";

const dbKeyFor = (provider: ApiKeyProvider): string => `${provider}_api_key`;

/** Ported settings/API-key commands; names and JSON shapes match the retired Rust backend's commands/settings.rs. */
export function createSettingsCommands(db: DatabaseSync) {
  function readValue(provider: ApiKeyProvider): string | null {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(dbKeyFor(provider)) as { value: string } | undefined;
    return row ? row.value : null;
  }

  function clearAccountPrices(provider: ApiKeyProvider) {
    db.prepare("DELETE FROM settings WHERE key GLOB 'generation_price_cache:*' AND CASE WHEN json_valid(value) THEN json_extract(value, '$.provider') END = ?").run(provider);
  }

  return {
    ...createLocalGenerationCommands(db),
    ...createGenerationPricingCommands(db),
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
      if (readValue(provider) !== trimmed) clearAccountPrices(provider);
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      ).run(dbKeyFor(provider), trimmed);
    },

    delete_api_key(args?: Record<string, unknown>): void {
      const provider = parseApiKeyProvider(args?.provider);
      clearAccountPrices(provider);
      db.prepare("DELETE FROM settings WHERE key = ?").run(dbKeyFor(provider));
    },
  };
}
