import { getApiKey } from "./backend-api";
import {
  API_KEY_PROVIDERS,
  type ApiKeyProvider,
} from "../../shared/provider-catalog";
import type { Result } from "../../shared/result";

export async function resolveGenerationKey(
  provider: ApiKeyProvider,
): Promise<Result<string>> {
  try {
    const key = (await getApiKey(provider)) ?? "";
    if (!key && provider !== "local") {
      const name =
        API_KEY_PROVIDERS.find((entry) => entry.id === provider)?.name ??
        provider;
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `${name} API key is not configured. Please add it in Settings.`,
        },
      };
    }
    return { ok: true, value: key };
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message:
          cause instanceof Error
            ? cause.message
            : "The generation credential could not be read.",
      },
    };
  }
}
