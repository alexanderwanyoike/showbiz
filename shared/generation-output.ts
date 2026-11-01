export interface GenerationReceipt {
  reported_microusd: number | null;
  provider_request_id: string | null;
}
export type GenerationOutput<T> =
  | { ok: true; value: { media: T; receipt: GenerationReceipt } }
  | {
      ok: false;
      error: { code: "IO_ERROR" | "INVALID_INPUT"; message: string };
      receipt?: GenerationReceipt;
    };
export interface GenerationObserver {
  receipt: (value: GenerationReceipt) => Promise<void>;
}
