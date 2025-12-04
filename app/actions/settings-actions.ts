"use server";

import {
  getSetting,
  setSetting,
  deleteSetting,
  getApiKeySource,
} from "../lib/data/settings";

export type ApiKeyProvider = "gemini" | "ltx";

interface ApiKeyStatus {
  provider: ApiKeyProvider;
  name: string;
  isConfigured: boolean;
  source: "database" | "environment" | null;
}

/**
 * Get status of all API keys (without exposing actual values)
 */
export async function getApiKeyStatusAction(): Promise<ApiKeyStatus[]> {
  return [
    {
      provider: "gemini",
      name: "Google AI (Gemini)",
      isConfigured: getApiKeySource("gemini") !== null,
      source: getApiKeySource("gemini"),
    },
    {
      provider: "ltx",
      name: "LTX Video",
      isConfigured: getApiKeySource("ltx") !== null,
      source: getApiKeySource("ltx"),
    },
  ];
}

/**
 * Save an API key to the database
 */
export async function saveApiKeyAction(
  provider: ApiKeyProvider,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { success: false, error: "API key cannot be empty" };
  }

  try {
    setSetting(`${provider}_api_key`, apiKey.trim());
    return { success: true };
  } catch (error) {
    console.error("Failed to save API key:", error);
    return { success: false, error: "Failed to save API key" };
  }
}

/**
 * Delete an API key from the database (will fall back to env var if set)
 */
export async function deleteApiKeyAction(
  provider: ApiKeyProvider
): Promise<{ success: boolean; error?: string }> {
  try {
    deleteSetting(`${provider}_api_key`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete API key:", error);
    return { success: false, error: "Failed to delete API key" };
  }
}

/**
 * Check if an API key is valid by testing it (optional, for validation)
 */
export async function testApiKeyAction(
  provider: ApiKeyProvider,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  // For now, just do basic validation
  // Could add actual API validation calls in the future
  if (!apiKey || apiKey.trim().length < 10) {
    return { valid: false, error: "API key appears to be too short" };
  }

  return { valid: true };
}
