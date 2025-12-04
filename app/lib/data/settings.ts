import { db } from "../db";

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

// API key environment variable mappings
const API_KEY_ENV_MAP: Record<string, string> = {
  gemini_api_key: "GEMINI_API_KEY",
  ltx_api_key: "LTX_API_KEY",
};

export function getSetting(key: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as SettingRow | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`
  ).run(key, value, value);
}

export function deleteSetting(key: string): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as SettingRow[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

/**
 * Get an API key - checks database first, then falls back to environment variable
 */
export function getApiKey(provider: string): string | null {
  const dbKey = `${provider}_api_key`;

  // Check database first
  const dbValue = getSetting(dbKey);
  if (dbValue) {
    return dbValue;
  }

  // Fall back to environment variable
  const envVar = API_KEY_ENV_MAP[dbKey];
  if (envVar) {
    return process.env[envVar] ?? null;
  }

  return null;
}

/**
 * Check where an API key is configured (for UI display)
 */
export function getApiKeySource(provider: string): "database" | "environment" | null {
  const dbKey = `${provider}_api_key`;

  // Check database first
  const dbValue = getSetting(dbKey);
  if (dbValue) {
    return "database";
  }

  // Check environment variable
  const envVar = API_KEY_ENV_MAP[dbKey];
  if (envVar && process.env[envVar]) {
    return "environment";
  }

  return null;
}
