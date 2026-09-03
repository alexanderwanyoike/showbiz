import type {
  ApiKeyProvider,
  ProviderDefinition,
} from "../../shared/provider-catalog";

interface ApiKeyStatusLike<ProviderId extends string> {
  provider: ProviderId;
  name?: string;
  is_configured: boolean;
  source: string | null;
}

interface ModelCredentialRequirement<ProviderId extends string> {
  name: string;
  apiKeyProvider: ProviderId;
}

export interface ProviderSetting<
  ProviderId extends string = ApiKeyProvider,
> extends ProviderDefinition<ProviderId> {
  isConfigured: boolean;
  source: string | null;
  modelNames: string[];
}

export function buildProviderSettings<ProviderId extends string>(
  providers: readonly ProviderDefinition<ProviderId>[],
  statuses: readonly ApiKeyStatusLike<ProviderId>[],
  models: readonly ModelCredentialRequirement<ProviderId>[]
): ProviderSetting<ProviderId>[] {
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

export function filterProviderSettings<ProviderId extends string>(
  providers: readonly ProviderSetting<ProviderId>[],
  query: string
): ProviderSetting<ProviderId>[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...providers];

  return providers.filter((provider) =>
    [provider.id, provider.name, ...provider.modelNames].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    )
  );
}
