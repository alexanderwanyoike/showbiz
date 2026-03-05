import { fetch } from "./http";
import { pollUntilDone } from "./poll";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

const POLL_INITIAL_MS = 2000;
const POLL_MAX_MS = 10000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error?: string;
}

export function parseReplicateError(status: number, body: string): string {
  if (status === 401) return "Invalid Replicate API token.";
  if (status === 402) return "Billing issue with your Replicate account.";
  if (status === 429) return "Replicate rate limit exceeded. Please try again later.";
  if (status === 422) {
    try {
      const parsed = JSON.parse(body);
      const detail = parsed.detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        return detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join("; ");
      }
    } catch {
      // not JSON
    }
  }
  if (body) return body;
  return `Replicate error (${status})`;
}

export async function createPrediction(
  model: string,
  input: Record<string, unknown>,
  apiKey: string,
  preferWait?: boolean
): Promise<ReplicatePrediction> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (preferWait) {
    headers["Prefer"] = "wait";
  }

  const res = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(parseReplicateError(res.status, text));
  }

  return JSON.parse(text) as ReplicatePrediction;
}

export async function pollPrediction(
  predictionId: string,
  apiKey: string
): Promise<ReplicatePrediction> {
  return pollUntilDone<ReplicatePrediction>({
    check: async () => {
      const res = await fetch(
        `${REPLICATE_API_BASE}/predictions/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      const text = await res.text();

      if (!res.ok) {
        throw new Error(parseReplicateError(res.status, text));
      }

      const prediction = JSON.parse(text) as ReplicatePrediction;

      if (prediction.status === "succeeded") {
        return { done: true, value: prediction };
      }
      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new Error(
          `Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`
        );
      }

      // starting or processing — keep polling
      return { done: false };
    },
    initialInterval: POLL_INITIAL_MS,
    maxInterval: POLL_MAX_MS,
    timeout: POLL_TIMEOUT_MS,
    backoff: { type: "exponential", factor: 2 },
    label: "replicate",
  });
}

export async function downloadReplicateOutput(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Replicate output: ${res.status}`);
  }
  return res.blob();
}
