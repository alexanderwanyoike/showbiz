import { z } from "zod";
import type { Result } from "../../../shared/result";
import { providerErrorMessage } from "./provider-error-message";

export const kieResponseSchema = z.object({
  code: z.number().optional(),
  msg: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  data: z
    .object({
      downloadUrl: z.string().optional(),
      imageUrl: z.string().optional(),
      taskId: z.string().optional(),
      state: z.string().optional(),
      resultJson: z.string().nullable().optional(),
      failMsg: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export function parseKieError(code: number, msg: string): string {
  if (code === 401) return "Invalid kie.ai API key.";
  if (code === 402)
    return "Insufficient kie.ai credits. Please top up your account.";
  if (code === 429)
    return "kie.ai rate limit exceeded. Please try again later.";
  return msg || `kie.ai error (code ${code})`;
}

export async function readKieResponse(
  response: Pick<Response, "ok" | "status" | "json">,
): Promise<Result<z.infer<typeof kieResponseSchema>>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message: response.ok
          ? "kie.ai returned an unreadable response."
          : parseKieError(response.status, ""),
      },
    };
  }
  const envelope = z
    .object({
      code: z.union([z.number().int(), z.string().regex(/^\d+$/)]).optional(),
      msg: z.string().nullish(),
    })
    .safeParse(body);
  const code =
    envelope.success && envelope.data.code !== undefined
      ? Number(envelope.data.code)
      : undefined;
  if (!response.ok || (code !== undefined && code !== 200)) {
    const status = !response.ok ? response.status : (code ?? response.status);
    const message =
      providerErrorMessage(body) ??
      (envelope.success ? envelope.data.msg : null) ??
      "";
    return {
      ok: false,
      error: { code: "IO_ERROR", message: parseKieError(status, message) },
    };
  }
  const parsed = kieResponseSchema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            providerErrorMessage(body) ??
            "kie.ai returned an unsupported response.",
        },
      };
}
