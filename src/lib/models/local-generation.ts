import { z } from "zod";
import { fetch } from "./http";
import type { LocalGenerationConfig } from "../../../shared/local-generation";
import type { GenerationOutput } from "../../../shared/generation-output";
import type { VideoGenerationRequest } from "../generation/types";

const responseSchema = z.object({
  id: z.string().optional(),
  data: z
    .array(
      z.object({
        b64_json: z.string().min(1),
        media_type: z.string().optional(),
      }),
    )
    .min(1),
});
async function requestMedia(
  config: LocalGenerationConfig,
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<GenerationOutput<{ base64: string; media_type?: string }>> {
  try {
    const response = await fetch(`${config.endpoint}${path}`, {
      method: "POST",
      timeout_ms: 3600000,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ ...body, response_format: "b64_json" }),
    });
    if (!response.ok)
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message: `Local generation failed (${response.status}). Check the server, model configuration and optional key.`,
        },
      };
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            "The local server did not return base64 media. Check that it supports the LocalAI JSON API.",
        },
      };
    return {
      ok: true,
      value: {
        media: {
          base64: parsed.data.data[0].b64_json,
          media_type: parsed.data.data[0].media_type,
        },
        receipt: {
          reported_microusd: null,
          provider_request_id: parsed.data.id ?? null,
        },
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message:
          "Could not connect to the local generation server or read its response.",
      },
    };
  }
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
  return {
    ok: true,
    value: {
      media: `data:${result.value.media.media_type ?? "image/png"};base64,${result.value.media.base64}`,
      receipt: result.value.receipt,
    },
  };
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
      ...(request.mode === "image-to-video" && request.endImage
        ? { end_image: request.endImage }
        : {}),
    },
    apiKey,
  );
  if (!result.ok) return result;
  try {
    const bytes = Uint8Array.from(atob(result.value.media.base64), (char) =>
      char.charCodeAt(0),
    );
    return {
      ok: true,
      value: {
        media: new Blob([bytes.buffer], {
          type: result.value.media.media_type ?? "video/mp4",
        }),
        receipt: result.value.receipt,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message: "The local server returned invalid base64 video.",
      },
    };
  }
}
