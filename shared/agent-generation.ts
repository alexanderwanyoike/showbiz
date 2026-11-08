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
  /** The resolved prompt and pictures the job will use, frozen into the quote. */
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
        /** The start frame take and end frame content the video was quoted with. */
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

export interface AgentQuote {
  quote_id: string;
  expires_at: string;
  model_id: string;
  provider: string;
  kind: GenerationCostRequest["kind"];
  min_microusd: number;
  max_microusd: number;
  price_source: string;
  price_checked_at: string;
  price_freshness: z.infer<typeof priceFreshnessSchema> | null;
  price_stale: boolean;
  price_basis: GenerationPrice;
  excludes_input_cost: boolean;
  fingerprint: string;
  budget_remaining_microusd: number;
}

export const agentGenerationErrorCodes = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "UNAVAILABLE",
  "IO_ERROR",
  "NO_BUDGET",
  "MODEL_NOT_ALLOWED",
  "OVER_REQUEST_CAP",
  "OVER_BUDGET",
  "PRICE_UNKNOWN",
  "QUOTE_EXPIRED",
  "QUOTE_NOT_FOUND",
  "QUOTE_STALE",
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

export interface AgentJob {
  job_id: string;
  request_id: string;
  quote_id: string;
  grant_id: string;
  project_id: string;
  subject_id: string;
  usage_request_id: string;
  model_id: string;
  kind: string;
  reserved_microusd: number;
  reported_microusd: number | null;
  /** null until the app knows whether a provider request was sent. */
  provider_called: boolean | null;
  status: AgentJobStatus;
  /** confirmed once the provider reports a charge; released only if the provider was never called. */
  charge_status: "confirmed" | "estimated" | "released";
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
