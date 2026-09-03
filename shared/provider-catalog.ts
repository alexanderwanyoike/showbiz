export const API_KEY_PROVIDERS = [
  {
    id: "gemini",
    name: "Google AI (Gemini)",
    credentialLabel: "Google AI API key",
    helpText: "Use an API key created in Google AI Studio.",
    order: 10,
  },
  {
    id: "openai",
    name: "OpenAI",
    credentialLabel: "OpenAI API key",
    helpText: "Use an API key created in the OpenAI platform.",
    order: 20,
  },
  {
    id: "ltx",
    name: "LTX Video",
    credentialLabel: "LTX API key",
    helpText: "Use an API key from your LTX account.",
    order: 30,
  },
  {
    id: "kie",
    name: "Kie AI",
    credentialLabel: "Kie AI API key",
    helpText: "Use an API key from your Kie AI account.",
    order: 40,
  },
  {
    id: "fal",
    name: "fal.ai",
    credentialLabel: "fal.ai API key",
    helpText: "Use an API key from your fal.ai account.",
    order: 50,
  },
  {
    id: "replicate",
    name: "Replicate",
    credentialLabel: "Replicate API token",
    helpText: "Use an API token from your Replicate account.",
    order: 60,
  },
] as const;

export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number]["id"];

export interface ApiKeyProviderDefinition {
  readonly id: ApiKeyProvider;
  readonly name: string;
  readonly credentialLabel: string;
  readonly helpText: string;
  readonly order: number;
}

const API_KEY_PROVIDER_IDS = new Set<string>(
  API_KEY_PROVIDERS.map((provider) => provider.id)
);

export function isApiKeyProvider(value: string): value is ApiKeyProvider {
  return API_KEY_PROVIDER_IDS.has(value);
}

export function parseApiKeyProvider(value: unknown): ApiKeyProvider {
  const provider = String(value);
  if (!isApiKeyProvider(provider)) {
    throw new Error(`Unknown API key provider: "${provider}"`);
  }
  return provider;
}
