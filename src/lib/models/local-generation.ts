import { z } from "zod";
import { fetch } from "./http";
import { responseErrorMessage } from "./provider-error-message";
import type { LocalGenerationConfig } from "../../../shared/local-generation";
import type {
  GenerationOutput,
  GenerationReceipt,
} from "../../../shared/generation-output";
import type { VideoGenerationRequest } from "../generation/types";

const responseSchema = z.object({
  id: z.string().optional(),
  data: z
    .array(
      z
        .object({
          url: z.string().min(1).optional(),
          b64_json: z.string().min(1).optional(),
          media_type: z.string().optional(),
        })
        .refine((item) => !!item.url || !!item.b64_json),
    )
    .min(1),
});
type LocalMedia = { blob: Blob } | { base64: string; media_type?: string };
const failure = (
  message: string,
  receipt?: GenerationReceipt,
): GenerationOutput<never> => ({
  ok: false,
  error: { code: "IO_ERROR", message },
  ...(receipt ? { receipt } : {}),
});
const INFERENCE_TIMEOUT_MS = 60 * 60 * 1000;

async function requestMedia(
  config: LocalGenerationConfig,
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<GenerationOutput<LocalMedia>> {
  let receipt: GenerationReceipt | undefined;
  try {
    const response = await fetch(`${config.endpoint}${path}`, {
      method: "POST",
      timeout_ms: INFERENCE_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ ...body, response_format: "url" }),
    });
    if (!response.ok)
      return failure(
        `Local generation failed (${response.status}). ${(await responseErrorMessage(response)) ?? "Check the server, model configuration and optional key."}`,
      );
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success)
      return failure(
        "The local server did not return a media URL or base64 media. Check that it supports the LocalAI JSON API.",
      );
    receipt = {
      reported_microusd: null,
      provider_request_id: parsed.data.id ?? null,
    };
    const item = parsed.data.data[0];
    if (item.url) {
      const url = new URL(item.url, `${config.endpoint}/`);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return failure(
          "The local server returned an unsupported media URL.",
          receipt,
        );
      const sameOrigin = url.origin === new URL(config.endpoint).origin;
      const downloaded = await fetch(url.toString(), {
        timeout_ms: INFERENCE_TIMEOUT_MS,
        headers:
          sameOrigin && apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!downloaded.ok)
        return failure(
          `The local media could not be downloaded (${downloaded.status}). ${(await responseErrorMessage(downloaded)) ?? "Try the request again."}`,
          receipt,
        );
      return {
        ok: true,
        value: { media: { blob: await downloaded.blob() }, receipt },
      };
    }
    return {
      ok: true,
      value: {
        media: { base64: item.b64_json ?? "", media_type: item.media_type },
        receipt,
      },
    };
  } catch (cause) {
    return failure(
      `Local generation request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      receipt,
    );
  }
}
function validMediaBlob(blob: Blob, family: "image" | "video"): boolean {
  return (
    blob.size > 0 &&
    (!blob.type ||
      blob.type === "application/octet-stream" ||
      blob.type.startsWith(`${family}/`))
  );
}
function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function imageDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index++)
    binary += String.fromCharCode(bytes[index]);
  return `data:${blob.type.startsWith("image/") ? blob.type : "image/png"};base64,${btoa(binary)}`;
}
export async function generateLocalImage(
  config: LocalGenerationConfig,
  prompt: string,
  apiKey: string,
): Promise<GenerationOutput<string>> {
  if (!config.image_model)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Configure your local image model in Settings first.",
      },
    };
  const result = await requestMedia(
    config,
    "/v1/images/generations",
    { model: config.image_model, prompt, n: 1 },
    apiKey,
  );
  if (!result.ok) return result;
  try {
    const media = result.value.media;
    if ("blob" in media && !validMediaBlob(media.blob, "image"))
      return failure(
        "The local server returned an empty or unsupported image download.",
        result.value.receipt,
      );
    return {
      ok: true,
      value: {
        media:
          "blob" in media
            ? await imageDataUrl(media.blob)
            : `data:${media.media_type ?? "image/png"};base64,${media.base64}`,
        receipt: result.value.receipt,
      },
    };
  } catch (cause) {
    return failure(
      `The local image could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
      result.value.receipt,
    );
  }
}
export async function generateLocalVideo(
  config: LocalGenerationConfig,
  request: VideoGenerationRequest,
  apiKey: string,
): Promise<GenerationOutput<Blob>> {
  if (!config.video_model)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Configure your local video model in Settings first.",
      },
    };
  const seconds = Number(request.settings.duration.replace(/s$/, ""));
  const result = await requestMedia(
    config,
    "/video",
    {
      model: config.video_model,
      prompt: request.prompt,
      ...(Number.isFinite(seconds) && seconds > 0
        ? { seconds: String(seconds) }
        : {}),
      ...(request.mode === "image-to-video" && request.startImage
        ? { start_image: request.startImage }
        : {}),
    },
    apiKey,
  );
  if (!result.ok) return result;
  try {
    const media = result.value.media;
    if ("blob" in media && !validMediaBlob(media.blob, "video"))
      return failure(
        "The local server returned an empty or unsupported video download.",
        result.value.receipt,
      );
    return {
      ok: true,
      value: {
        media:
          "blob" in media
            ? media.blob
            : new Blob([decodeBase64(media.base64)], {
                type: media.media_type ?? "video/mp4",
              }),
        receipt: result.value.receipt,
      },
    };
  } catch {
    return failure(
      "The local server returned invalid base64 video.",
      result.value.receipt,
    );
  }
}
