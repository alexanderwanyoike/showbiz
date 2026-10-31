import { z } from "zod";
import { fetch } from "./http";
import { openRouterReceipt } from "./openrouter-receipt";
import type { GenerationOutput } from "../../../shared/generation-output";

const responseSchema = z.object({
  id: z.string().optional(),
  data: z.array(z.object({ b64_json: z.string().min(1), media_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]).optional() })).min(1),
  usage: z.object({ cost: z.number().nonnegative().nullable().optional() }).optional(),
});
export async function generateOpenRouterImage(request: { model: string; prompt: string; references?: string[] }, apiKey: string): Promise<GenerationOutput<string>> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: request.model, prompt: request.prompt, n: 1, ...(request.references?.length ? { input_references: request.references.map(url => ({ type: "image_url", image_url: { url } })) } : {}) }),
    });
    if (!response.ok) return { ok: false, error: { code: "IO_ERROR", message: `OpenRouter image request failed (${response.status}). Check your provider key, credits and model access.` } };
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, error: { code: "IO_ERROR", message: "OpenRouter returned an unsupported image response." } };
    const image = parsed.data.data[0];
    return { ok: true, value: { media: `data:${image.media_type ?? "image/png"};base64,${image.b64_json}`, receipt: openRouterReceipt(parsed.data) } };
  } catch {
    return { ok: false, error: { code: "IO_ERROR", message: "Could not complete the OpenRouter image request." } };
  }
}
