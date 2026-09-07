import { describe, expect, it } from "vitest";
import type { ProviderDefinition } from "../../shared/provider-catalog";
import {
  buildProviderSettings,
  filterProviderSettings,
} from "./provider-settings";

const providers = [
  { id: "openai", name: "OpenAI", credentialLabel: "OpenAI API key", helpText: "OpenAI help", order: 20 },
  { id: "fal", name: "fal.ai", credentialLabel: "fal.ai API key", helpText: "fal help", order: 30 },
  { id: "gemini", name: "Google AI (Gemini)", credentialLabel: "Google AI API key", helpText: "Gemini help", order: 10 },
] satisfies ProviderDefinition<"openai" | "fal" | "gemini">[];

const models = [
  { name: "Nano Banana Pro", apiKeyProvider: "gemini" },
  { name: "Nano Banana Pro", apiKeyProvider: "gemini" },
  { name: "GPT Image 2", apiKeyProvider: "openai" },
  { name: "Kling 3", apiKeyProvider: "fal" },
] as const;

describe("provider settings", () => {
  it("sorts configured providers first and keeps catalog order within each group", () => {
    const settings = buildProviderSettings(providers, [
      { provider: "fal", name: "fal.ai", is_configured: true, source: "database" },
    ], models);

    expect(settings.map((provider) => provider.id)).toEqual([
      "fal",
      "gemini",
      "openai",
    ]);
  });

  it("deduplicates model names associated with each provider", () => {
    const settings = buildProviderSettings(providers, [], models);

    expect(
      settings.find((provider) => provider.id === "gemini")?.modelNames
    ).toEqual(["Nano Banana Pro"]);
  });

  it("filters by provider name, provider id, or model name", () => {
    const settings = buildProviderSettings(providers, [], models);

    expect(filterProviderSettings(settings, "google").map((provider) => provider.id)).toEqual(["gemini"]);
    expect(filterProviderSettings(settings, "openai").map((provider) => provider.id)).toEqual(["openai"]);
    expect(filterProviderSettings(settings, "kling").map((provider) => provider.id)).toEqual(["fal"]);
  });

  it("finds the right provider in a large catalog", () => {
    const largeCatalog = Array.from({ length: 250 }, (_, index) => ({
      id: `provider-${index}`,
      name: `Provider ${index}`,
      credentialLabel: `Provider ${index} API key`,
      helpText: `Provider ${index} help`,
      order: index,
    })) satisfies ProviderDefinition<string>[];
    const settings = buildProviderSettings(largeCatalog, [], []);

    expect(filterProviderSettings(settings, "provider 217")).toHaveLength(1);
    expect(filterProviderSettings(settings, "provider 217")[0].name).toBe(
      "Provider 217"
    );
  });
});
