import { z } from "zod";
import { SHOT_FRAME_ROLES } from "./shot-frames";
import {
  generationCostRequestSchema,
  generationPriceSchema,
  microusdSchema as microusd,
  priceFreshnessSchema,
} from "./generation-price-schema";
import type {
  GenerationCostEstimate,
  GenerationCostRequest,
  GenerationPrice,
} from "./generation-cost";

export const AGENT_REQUEST_CHANNEL = "showbiz:agent_request";
export const AGENT_RESPONSE_CHANNEL = "showbiz:agent_response";

const id = z.string().min(1).max(200);
/** Most pictures one composition may use; a frame records at most one fewer character so its location view still fits. */
export const MAX_REFERENCE_PICTURES = 10;
const prompt = z.string().trim().min(1).max(50000);

const bibleAsset = { target: z.literal("bible_asset"), asset_id: id, model_id: id };
const shotStartFrame = { target: z.literal("shot_start_frame"), shot_id: id };
export const agentQuoteRequestSchema = z.union([
  z.strictObject({ ...bibleAsset, operation: z.literal("generate"), prompt }),
  z.strictObject({
    ...bibleAsset,
    operation: z.literal("retake"),
    prompt: prompt.optional(),
  }),
  z.strictObject({
    ...bibleAsset,
    operation: z.literal("edit"),
    source_variant_id: id,
    prompt,
  }),
  z.strictObject({ ...shotStartFrame, operation: z.literal("generate"), prompt }),
  z.strictObject({
    ...shotStartFrame,
    operation: z.literal("edit"),
    source_take_id: id,
    prompt,
  }),
  z.strictObject({
    target: z.literal("shot_video"),
    operation: z.literal("generate"),
    shot_id: id,
  }),
]);
export type AgentQuoteRequest = z.infer<typeof agentQuoteRequestSchema>;


export const agentQuoteTargetSchema = z.strictObject({
  model_id: id,
  provider: id,
  cost_request: generationCostRequestSchema,
  subject: z.strictObject({ project_id: id, subject_id: id }),
  /** The resolved prompt and pictures the job will use, fixed when it is planned. */
  inputs: z.strictObject({
    // A video may have no prompt when it starts from a frame.
    prompt: z.string().trim().max(50000),
    reference_variant_ids: z.array(id).max(MAX_REFERENCE_PICTURES),
    source_variant_id: id.optional(),
    source_take_id: id.optional(),
    aspect_ratio: z.literal("16:9").optional(),
    video: z
      .strictObject({
        mode: z.enum(["text-to-video", "image-to-video"]),
        settings: z.strictObject({
          duration: z.string().max(16),
          resolution: z.string().max(32).optional(),
          aspectRatio: z.string().max(32).optional(),
          audio: z.boolean().optional(),
        }),
        uses_end_frame: z.boolean(),
        /** The start frame take and end frame content the video was planned with. */
        start_take_id: id.optional(),
        end_frame_digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      })
      .optional(),
  }),
});
export type AgentQuoteTarget = z.infer<typeof agentQuoteTargetSchema>;
export const agentQuotePlanSchema = agentQuoteTargetSchema.extend({
  estimate: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("unavailable"), reason: z.string() }),
    z
      .strictObject({
        kind: z.literal("estimate"),
        min_microusd: microusd,
        max_microusd: microusd,
        price: generationPriceSchema,
        stale: z.boolean(),
        price_freshness: priceFreshnessSchema.optional(),
        excludes_input_cost: z.boolean(),
      })
      .refine((estimate) => estimate.min_microusd <= estimate.max_microusd),
  ]),
});

/** What the renderer resolves for a request: the same model, settings and estimate the app would use. */
export type AgentQuotePlan = z.infer<typeof agentQuotePlanSchema>;

export const agentGenerationErrorCodes = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "UNAVAILABLE",
  "IO_ERROR",
  "BUSY",
  "JOB_LIMIT",
  "NO_ANSWER",
] as const;
export type AgentGenerationErrorCode = (typeof agentGenerationErrorCodes)[number];

export type AgentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AgentGenerationErrorCode; message: string } };

export const agentFailure = (
  code: AgentGenerationErrorCode,
  message: string,
): AgentResult<never> => ({ ok: false, error: { code, message } });

export interface AgentRequest {
  request_id: string;
  operation: string;
  input: unknown;
}

export type AgentJobStatus =
  | "accepted"
  | "running"
  | "completed"
  | "failed"
  | "interrupted";

export const agentJobEstimateSchema = z.strictObject({
  min_microusd: microusd,
  max_microusd: microusd,
  price_source: z.string(),
  price_checked_at: z.string(),
  price_stale: z.boolean(),
  excludes_input_cost: z.boolean(),
});
export type AgentJobEstimate = z.infer<typeof agentJobEstimateSchema>;

export interface AgentJob {
  job_id: string;
  request_id: string;
  /** What the request asked for, so a retry with the same request ID but other arguments is refused. */
  request_fingerprint: string;
  project_id: string;
  subject_id: string;
  usage_request_id: string;
  model_id: string;
  kind: string;
  /** null when no price was known when the job started; an unknown price never blocks generation. */
  estimate: AgentJobEstimate | null;
  reported_microusd: number | null;
  /** null until the app knows whether a provider request was sent. */
  provider_called: boolean | null;
  status: AgentJobStatus;
  /** confirmed once the provider reports a charge; released only if the provider was never called; unknown when the price was unknown and no charge is confirmed. */
  charge_status: "confirmed" | "estimated" | "unknown" | "released";
  /** The new Bible take (variant_id), shot image take (take_id) or video take (video_take_id). */
  result: AgentJobResult | null;
  error: string | null;
  warnings: string[];
  created_at: string;
  updated_at: string;
}

export const agentJobStartSchema = z.strictObject({
  job_id: id,
  usage_request_id: id,
  request: agentQuoteRequestSchema,
  plan: agentQuotePlanSchema,
});
export type AgentJobStart = z.infer<typeof agentJobStartSchema>;

export const agentJobResultSchema = z.strictObject({
  variant_id: id.optional(),
  take_id: id.optional(),
  video_take_id: id.optional(),
});
export type AgentJobResult = z.infer<typeof agentJobResultSchema>;

export type AgentJobReport =
  | { job_id: string; status: "running" }
  | {
      job_id: string;
      status: "completed";
      result: AgentJobResult;
      warnings: string[];
    }
  | { job_id: string; status: "failed"; error: string };

export const AGENT_JOB_REPORT_CHANNEL = "showbiz:agent_job_report";

export const mediaPreviewRequestSchema = z
  .strictObject({
    bible_variant_id: id.optional(),
    image_take_id: id.optional(),
    video_take_id: id.optional(),
  })
  .refine(
    (input) =>
      [input.bible_variant_id, input.image_take_id, input.video_take_id].filter(Boolean)
        .length === 1,
    { message: "Pass exactly one of bible_variant_id, image_take_id or video_take_id." },
  );
export type MediaPreviewRequest = z.infer<typeof mediaPreviewRequestSchema>;
export const mediaPreviewSchema = z.strictObject({
  images: z
    .array(
      z.strictObject({
        mime_type: z.literal("image/jpeg"),
        // A 512 px JPEG stays well below this, which keeps replies under the 1 MiB bridge limit.
        base64: z.string().min(1).max(300_000),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(3),
});
export type MediaPreview = z.infer<typeof mediaPreviewSchema>;

export const setShotFrameRequestSchema = z.strictObject({
  shot_id: id,
  role: z.enum(SHOT_FRAME_ROLES),
  bible_variant_id: id,
});
export type SetShotFrameRequest = z.infer<typeof setShotFrameRequestSchema>;

export const BIBLE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
// About 730 KB of picture, which keeps the whole request under the 1 MiB bridge limit.
export const MAX_BIBLE_IMAGE_BASE64 = 1_000_000;
// Checked from the image header before full decoding, so a small file cannot claim an enormous canvas.
export const MAX_BIBLE_IMAGE_PIXELS = 40_000_000;
const byteLength = (base64: string) => (base64.length / 4) * 3 - (/=*$/.exec(base64)?.[0].length ?? 0);
const uint32le = (bytes: string, at: number) =>
  (bytes.charCodeAt(at) | (bytes.charCodeAt(at + 1) << 8) | (bytes.charCodeAt(at + 2) << 16) | (bytes.charCodeAt(at + 3) << 24)) >>> 0;
// Browsers decode a cut-off PNG or JPEG without error, so the file's end marker or declared length is checked too.
const completeImage: Record<
  (typeof BIBLE_IMAGE_TYPES)[number],
  (head: string, tail: string, length: number) => boolean
> = {
  "image/png": (head, tail) => head.startsWith("\x89PNG\r\n\x1a\n") && tail.endsWith("IEND\xaeB`\x82"),
  "image/jpeg": (head, tail) => head.startsWith("\xff\xd8\xff") && tail.endsWith("\xff\xd9"),
  "image/webp": (head, _tail, length) =>
    head.startsWith("RIFF") && head.slice(8, 12) === "WEBP" && uint32le(head, 4) === length - 8,
};
export const addBibleImageRequestSchema = z
  .strictObject({
    bible_asset_id: id,
    mime_type: z.enum(BIBLE_IMAGE_TYPES),
    base64: z.base64().min(1).max(MAX_BIBLE_IMAGE_BASE64),
    name: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    ({ mime_type, base64 }) =>
      completeImage[mime_type](atob(base64.slice(0, 16)), atob(base64.slice(-16)), byteLength(base64)),
    {
      message:
        "The picture's bytes are not a complete PNG, JPEG or WebP of the declared mime_type. Send the whole file as plain base64.",
      // Only well-formed base64 can be decoded to read its signature.
      when: ({ issues }) => issues.length === 0,
    },
  );
export type AddBibleImageRequest = z.infer<typeof addBibleImageRequestSchema>;
