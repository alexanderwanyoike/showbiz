import type {
  ApiKeyProvider,
  ApiKeyProviderDefinition,
} from "../../shared/provider-catalog";

interface ApiKeyStatusLike {
  provider: ApiKeyProvider;
  name?: string;
  is_configured: boolean;
  source: string | null;
}

interface ModelCredentialRequirement {
  name: string;
  apiKeyProvider: ApiKeyProvider;
}

export interface ProviderSetting extends ApiKeyProviderDefinition {
  isConfigured: boolean;
  source: string | null;
  modelNames: string[];
}

export function buildProviderSettings(
  providers: readonly ApiKeyProviderDefinition[],
  statuses: readonly ApiKeyStatusLike[],
  models: readonly ModelCredentialRequirement[]
): ProviderSetting[] {
  const statusesByProvider = new Map(
    statuses.map((status) => [status.provider, status])
  );

  return providers
    .map((provider) => {
      const status = statusesByProvider.get(provider.id);
      const modelNames = Array.from(
        new Set(
          models
            .filter((model) => model.apiKeyProvider === provider.id)
            .map((model) => model.name)
        )
      );

      return {
        ...provider,
        isConfigured: status?.is_configured ?? false,
        source: status?.source ?? null,
        modelNames,
      };
    })
    .sort(
      (left, right) =>
        Number(right.isConfigured) - Number(left.isConfigured) ||
        left.order - right.order
    );
}

export function filterProviderSettings(
  providers: readonly ProviderSetting[],
  query: string
): ProviderSetting[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...providers];

  return providers.filter((provider) =>
    [provider.id, provider.name, ...provider.modelNames].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
}
