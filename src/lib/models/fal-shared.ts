import { fetch } from "./http";
import { pollUntilDone } from "./poll";

const FAL_QUEUE_BASE = "https://queue.fal.run";

const POLL_INITIAL_MS = 2000;
const POLL_MAX_MS = 8000;
const POLL_FACTOR = 2;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function parseFalError(status: number, body: string): string {
  if (status === 401) return "Invalid fal.ai API key.";
  if (status === 402) return "Insufficient fal.ai credits. Please top up your account.";
  if (status === 429) return "fal.ai rate limit exceeded. Please try again later.";
  if (body) return body;
  return `fal.ai error (${status})`;
}

/** Submit a job to the fal.ai queue, returns the request_id. */
export async function submitFalQueue(
  endpointId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<string> {
  const res = await fetch(`${FAL_QUEUE_BASE}/${endpointId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseFalError(res.status, text));
  }

  const json = (await res.json()) as { request_id?: string };
  if (!json.request_id) {
    throw new Error("fal.ai queue submit returned no request_id");
  }
  return json.request_id;
}

/** Poll a fal.ai queue request until completion, then fetch and return the result. */
export async function pollFalResult<T>(
  endpointId: string,
  requestId: string,
  apiKey: string
): Promise<T> {
  const headers = { Authorization: `Key ${apiKey}` };

  return pollUntilDone<T>({
    async check() {
      const statusRes = await fetch(
        `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}/status`,
        { headers }
      );

      if (!statusRes.ok) {
        const text = await statusRes.text();
        throw new Error(parseFalError(statusRes.status, text));
      }

      const statusJson = (await statusRes.json()) as { status: string };

      if (statusJson.status === "COMPLETED") {
        // Fetch the full result
        const resultRes = await fetch(
          `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}`,
          { headers }
        );
        if (!resultRes.ok) {
          const text = await resultRes.text();
          throw new Error(parseFalError(resultRes.status, text));
        }
        const value = (await resultRes.json()) as T;
        return { done: true as const, value };
      }

      if (statusJson.status === "FAILED") {
        throw new Error("fal.ai generation failed");
      }

      // IN_QUEUE or IN_PROGRESS — keep polling
      return { done: false as const };
    },
    initialInterval: POLL_INITIAL_MS,
    maxInterval: POLL_MAX_MS,
    timeout: POLL_TIMEOUT_MS,
    backoff: { type: "exponential", factor: POLL_FACTOR },
    label: "fal.ai",
  });
}

/**
 * Format a base64 image as a data URI for use in fal.ai image_url fields.
 * fal.ai accepts data URIs directly, so no upload is needed.
 */
export function uploadImageToFal(imageBase64: string): string {
  if (imageBase64.startsWith("data:")) return imageBase64;
  return `data:image/png;base64,${imageBase64}`;
}
