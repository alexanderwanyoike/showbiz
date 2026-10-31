import { z } from "zod";
import { fetch } from "./http";
import { pollUntilDone } from "./poll";
import { openRouterReceipt } from "./openrouter-receipt";
import type { VideoGenerationRequest } from "../generation/types";
import type { GenerationOutput, GenerationReceipt } from "../../../shared/generation-output";

const jobSchema = z.object({
  id: z.string().min(1).max(256),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  usage: z.object({ cost: z.number().nonnegative().nullable().optional() }).optional(),
});
const failure = (message: string, receipt?: GenerationReceipt): GenerationOutput<Blob> => ({ ok: false, error: { code: "IO_ERROR", message }, receipt });

export async function generateOpenRouterVideo(model: string, request: VideoGenerationRequest, apiKey: string): Promise<GenerationOutput<Blob>> {
  let receipt: GenerationReceipt | undefined;
  try {
    const { settings } = request;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
    const frames = request.mode === "image-to-video" ? [
      ...(request.startImage ? [{ type: "image_url", image_url: { url: request.startImage }, frame_type: "first_frame" }] : []),
      ...(request.endImage ? [{ type: "image_url", image_url: { url: request.endImage }, frame_type: "last_frame" }] : []),
    ] : [];
    const duration = Number(settings.duration.replace(/s$/, ""));
    const submitted = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST", headers,
      body: JSON.stringify({ model, prompt: request.prompt,
        ...(Number.isSafeInteger(duration) && duration > 0 ? { duration } : {}),
        ...(settings.resolution && settings.resolution !== "auto" ? { resolution: settings.resolution } : {}),
        ...(settings.aspectRatio && settings.aspectRatio !== "auto" ? { aspect_ratio: settings.aspectRatio } : {}),
        ...(settings.audio !== undefined ? { generate_audio: settings.audio } : {}),
        ...(frames.length ? { frame_images: frames } : {}),
      }),
    });
    if (!submitted.ok) return failure(`OpenRouter video request failed (${submitted.status}). Check your provider key, credits and model access.`);
    const initial = jobSchema.safeParse(await submitted.json());
    if (!initial.success) return failure("OpenRouter returned an unsupported video job.");
    const job = initial.data.id;
    const url = `https://openrouter.ai/api/v1/videos/${encodeURIComponent(job)}`;
    return await pollUntilDone<GenerationOutput<Blob>>({
      initialInterval: 2000, maxInterval: 10000, timeout: 20 * 60 * 1000,
      backoff: { type: "linear", increment: 1000 }, label: "OpenRouter video",
      check: async () => {
        const response = await fetch(url, { headers });
        if (!response.ok) return { done: true, value: failure(`Could not read the OpenRouter video job (${response.status}).`, receipt) };
        const parsed = jobSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.id !== job) return { done: true, value: failure("OpenRouter returned an invalid job response.", receipt) };
        receipt = openRouterReceipt(parsed.data);
        if (parsed.data.status === "failed") return { done: true, value: failure("OpenRouter video generation failed. Check the request in your provider account.", receipt) };
        if (parsed.data.status !== "completed") return { done: false };
        const content = await fetch(`${url}/content?index=0`, { headers });
        if (!content.ok) return { done: true, value: failure(`The video was generated but could not be downloaded (${content.status}).`, receipt) };
        return { done: true, value: { ok: true, value: { media: await content.blob(), receipt } } };
      },
    });
  } catch {
    return failure("Could not complete the OpenRouter video request. Check the provider job before retrying.", receipt);
  }
}
