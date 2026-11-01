import {
  API_KEY_PROVIDERS,
  type ApiKeyProvider,
} from "../../shared/provider-catalog";

export interface ModelProviderIdentity {
  provider?: string;
  apiKeyProvider?: ApiKeyProvider;
}

export function modelProviderName(
  model: ModelProviderIdentity | undefined,
): string | undefined {
  return (
    model?.provider ??
    API_KEY_PROVIDERS.find((provider) => provider.id === model?.apiKeyProvider)
      ?.name
  );
}
