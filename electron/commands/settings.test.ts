import { describe, it, expect, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { createSettingsCommands } from "./settings";

function seed(db: DatabaseSync, key: string, value: string) {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
  ).run(key, value);
}

describe("save_api_key + get_api_key", () => {
  it("saves and retrieves an api key (parity: save_and_retrieve_api_key)", () => {
    const commands = createSettingsCommands(openTestDb());
    commands.save_api_key({ provider: "gemini", apiKey: "test-key-123" });
    expect(commands.get_api_key({ provider: "gemini" })).toBe("test-key-123");
  });

  it("overrides an existing key (parity: save_overrides_existing_key)", () => {
    const commands = createSettingsCommands(openTestDb());
    commands.save_api_key({ provider: "gemini", apiKey: "old-key" });
    commands.save_api_key({ provider: "gemini", apiKey: "new-key" });
    expect(commands.get_api_key({ provider: "gemini" })).toBe("new-key");
  });

  it("returns null for a missing key (parity: get_missing_key_returns_none)", () => {
    const commands = createSettingsCommands(openTestDb());
    expect(commands.get_api_key({ provider: "gemini" })).toBeNull();
  });

  it("trims whitespace before storing (parity: save_trims_whitespace)", () => {
    const commands = createSettingsCommands(openTestDb());
    commands.save_api_key({ provider: "gemini", apiKey: "  trimmed-key  " });
    expect(commands.get_api_key({ provider: "gemini" })).toBe("trimmed-key");
  });

  it("keeps providers independent (parity: multiple_providers_independent)", () => {
    const commands = createSettingsCommands(openTestDb());
    commands.save_api_key({ provider: "gemini", apiKey: "gemini-key" });
    commands.save_api_key({ provider: "ltx", apiKey: "ltx-key" });
    expect(commands.get_api_key({ provider: "gemini" })).toBe("gemini-key");
    expect(commands.get_api_key({ provider: "ltx" })).toBe("ltx-key");
  });

  it("rejects an empty api key", () => {
    const commands = createSettingsCommands(openTestDb());
    expect(() => commands.save_api_key({ provider: "gemini", apiKey: "" })).toThrow(
      "API key cannot be empty"
    );
  });

  it("rejects a whitespace-only api key", () => {
    const commands = createSettingsCommands(openTestDb());
    expect(() =>
      commands.save_api_key({ provider: "gemini", apiKey: "   " })
    ).toThrow("API key cannot be empty");
  });

  it("stores under the {provider}_api_key settings key", () => {
    const db = openTestDb();
    createSettingsCommands(db).save_api_key({ provider: "fal", apiKey: "fal-key" });
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("fal_api_key") as { value: string } | undefined;
    expect(row?.value).toBe("fal-key");
  });
});

describe("delete_api_key", () => {
  it("removes a stored key (parity: delete_api_key)", () => {
    const commands = createSettingsCommands(openTestDb());
    commands.save_api_key({ provider: "gemini", apiKey: "to-delete" });
    commands.delete_api_key({ provider: "gemini" });
    expect(commands.get_api_key({ provider: "gemini" })).toBeNull();
  });

  it("is a no-op for a provider with no stored key", () => {
    const commands = createSettingsCommands(openTestDb());
    expect(() => commands.delete_api_key({ provider: "gemini" })).not.toThrow();
  });
});

describe("get_api_key_status", () => {
  it("lists the six providers with their display names in order", () => {
    const commands = createSettingsCommands(openTestDb());
    const statuses = commands.get_api_key_status();
    expect(statuses).toEqual([
      { provider: "gemini", name: "Google AI (Gemini)", is_configured: false, source: null },
      { provider: "openai", name: "OpenAI", is_configured: false, source: null },
      { provider: "ltx", name: "LTX Video", is_configured: false, source: null },
      { provider: "kie", name: "Kie AI", is_configured: false, source: null },
      { provider: "fal", name: "fal.ai", is_configured: false, source: null },
      { provider: "replicate", name: "Replicate", is_configured: false, source: null },
    ]);
  });

  it("marks configured providers with source 'database'", () => {
    const db = openTestDb();
    seed(db, "openai_api_key", "sk-live");
    const statuses = createSettingsCommands(db).get_api_key_status();
    const openai = statuses.find((s) => s.provider === "openai");
    const gemini = statuses.find((s) => s.provider === "gemini");
    expect(openai).toEqual({
      provider: "openai",
      name: "OpenAI",
      is_configured: true,
      source: "database",
    });
    expect(gemini?.is_configured).toBe(false);
    expect(gemini?.source).toBeNull();
  });

  it("serializes is_configured as a boolean, not 0/1", () => {
    const db = openTestDb();
    seed(db, "replicate_api_key", "r8-key");
    const replicate = createSettingsCommands(db)
      .get_api_key_status()
      .find((s) => s.provider === "replicate");
    expect(typeof replicate?.is_configured).toBe("boolean");
    expect(replicate?.is_configured).toBe(true);
  });

  it("does not fall back to environment variables (no env source)", () => {
    vi.stubEnv("GEMINI_API_KEY", "env-injected-key");
    vi.stubEnv("gemini_api_key", "env-injected-key");
    try {
      const gemini = createSettingsCommands(openTestDb())
        .get_api_key_status()
        .find((s) => s.provider === "gemini");
      expect(gemini?.is_configured).toBe(false);
      expect(gemini?.source).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
