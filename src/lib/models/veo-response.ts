import { z } from "zod";
import type { Result } from "../../../shared/result";
import { providerErrorMessage } from "./provider-error-message";
import { parseGoogleApiError } from "./types";

export const veoOperationSchema = z
  .object({
    name: z.string().optional(),
    done: z.boolean().optional(),
    error: z.object({ message: z.string().optional() }).optional(),
    response: z
      .object({
        generateVideoResponse: z
          .object({
            generatedSamples: z
              .array(
                z.object({
                  video: z.object({ uri: z.string().optional() }).optional(),
                }),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export async function readVeoOperation(response: Pick<Response, "ok" | "status" | "json">): Promise<Result<z.infer<typeof veoOperationSchema>>> {
  let body: unknown;
  try { body = await response.json(); } catch {
    return { ok: false, error: { code: "IO_ERROR", message: `Veo returned an unreadable response (${response.status}).` } };
  }
  const parsed = veoOperationSchema.safeParse(body);
  if (!response.ok || !parsed.success || parsed.data.error) {
    const message = providerErrorMessage(body);
    return { ok: false, error: { code: "IO_ERROR", message: message ? parseGoogleApiError(JSON.stringify({ error: { message } }), response.status) : `Veo returned an unsupported response (${response.status}).` } };
  }
  return { ok: true, value: parsed.data };
}
