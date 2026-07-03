import { fetch } from "./http";
import { pollUntilDone } from "./poll";

const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_RUN_BASE = "https://fal.run";

const POLL_INITIAL_MS = 2000;
const POLL_MAX_MS = 8000;
const POLL_FACTOR = 2;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export interface FalQueueRequest {
  requestId: string;
  statusUrl?: string;
  responseUrl?: string;
}

export function parseFalError(status: number, body: string): string {
  if (status === 401) return "Invalid fal.ai API key.";
  if (status === 402) return "Insufficient fal.ai credits. Please top up your account.";
  if (status === 429) return "fal.ai rate limit exceeded. Please try again later.";
  if (body) return body;
  return `fal.ai error (${status})`;
}

function falQueueError(stage: string, endpointId: string, status: number, body: string): Error {
  return new Error(`fal.ai queue ${stage} failed for ${endpointId}: ${parseFalError(status, body)}`);
}

function falQueueRequestError(
  stage: string,
  endpointId: string,
  requestId: string,
  status: number,
  body: string
): Error {
  return new Error(
    `fal.ai queue ${stage} failed for ${endpointId} request ${requestId}: ${parseFalError(status, body)}`
  );
}

/** Submit a job to the fal.ai queue, preserving fal's request URLs. */
export async function submitFalQueueRequest(
  endpointId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<FalQueueRequest> {
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
    throw falQueueError("submit", endpointId, res.status, text);
  }

  const json = (await res.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!json.request_id) {
    throw new Error("fal.ai queue submit returned no request_id");
  }
  return {
    requestId: json.request_id,
    statusUrl: json.status_url,
    responseUrl: json.response_url,
  };
}

/** Submit a job to the fal.ai queue, returns the request_id. */
export async function submitFalQueue(
  endpointId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<string> {
  const request = await submitFalQueueRequest(endpointId, input, apiKey);
  return request.requestId;
}

async function fetchFalQueueUrl(
  url: string,
  headers: { Authorization: string }
): Promise<Awaited<ReturnType<typeof fetch>>> {
  const res = await fetch(url, { headers });
  if (res.status !== 405) return res;

  // fal's docs expose status_url/response_url as pollable URLs. Some live queue
  // endpoints still reject GET with 405, so retry POST only for that mismatch.
  return fetch(url, { method: "POST", headers });
}

/** Consecutive transient poll failures tolerated before giving up on a running job. */
const MAX_TRANSIENT_POLL_FAILURES = 5;

/** Poll statuses that recover on their own: server errors and rate limiting. */
function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * Poll a fal.ai queue request until completion, then fetch and return the result.
 *
 * Once submitted, the job keeps running on fal's side no matter what happens to
 * our polling requests — so a dropped connection, a 5xx, or a rate-limited
 * status check must NOT abandon the run. Those are retried on the normal poll
 * cadence and only give up after several failures in a row; definitive answers
 * (4xx, FAILED) still fail immediately.
 */
export async function pollFalResult<T>(
  endpointId: string,
  requestId: string,
  apiKey: string,
  urls: { statusUrl?: string; responseUrl?: string } = {}
): Promise<T> {
  const headers = { Authorization: `Key ${apiKey}` };
  const statusUrl =
    urls.statusUrl ?? `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}/status`;
  const responseUrl =
    urls.responseUrl ?? `${FAL_QUEUE_BASE}/${endpointId}/requests/${requestId}`;

  let transientFailures = 0;
  const retryTransient = (error: Error): { done: false } => {
    transientFailures += 1;
    if (transientFailures >= MAX_TRANSIENT_POLL_FAILURES) {
      throw new Error(
        `fal.ai polling gave up after ${MAX_TRANSIENT_POLL_FAILURES} consecutive failures for ${endpointId} request ${requestId} (the job may still be running on fal.ai): ${error.message}`
      );
    }
    return { done: false as const };
  };
  const asError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error));

  return pollUntilDone<T>({
    async check() {
      let statusRes: Awaited<ReturnType<typeof fetch>>;
      try {
        statusRes = await fetchFalQueueUrl(statusUrl, headers);
      } catch (error) {
        return retryTransient(asError(error));
      }

      if (!statusRes.ok) {
        const text = await statusRes.text();
        const error = falQueueRequestError("status", endpointId, requestId, statusRes.status, text);
        if (isTransientStatus(statusRes.status)) return retryTransient(error);
        throw error;
      }

      const statusJson = (await statusRes.json()) as { status: string };

      if (statusJson.status === "COMPLETED") {
        // Fetch the full result; a blip here is also retried, since the next
        // poll re-reads COMPLETED and re-fetches.
        let resultRes: Awaited<ReturnType<typeof fetch>>;
        try {
          resultRes = await fetchFalQueueUrl(responseUrl, headers);
        } catch (error) {
          return retryTransient(asError(error));
        }
        if (!resultRes.ok) {
          const text = await resultRes.text();
          const error = falQueueRequestError("result", endpointId, requestId, resultRes.status, text);
          if (isTransientStatus(resultRes.status)) return retryTransient(error);
          throw error;
        }
        const value = (await resultRes.json()) as T;
        return { done: true as const, value };
      }

      if (statusJson.status === "FAILED") {
        throw new Error("fal.ai generation failed");
      }

      // IN_QUEUE or IN_PROGRESS — keep polling
      transientFailures = 0;
      return { done: false as const };
    },
    initialInterval: POLL_INITIAL_MS,
    maxInterval: POLL_MAX_MS,
    timeout: POLL_TIMEOUT_MS,
    backoff: { type: "exponential", factor: POLL_FACTOR },
    label: "fal.ai",
  });
}

export async function runFalInference<T>(
  endpointId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<T> {
  const res = await fetch(`${FAL_RUN_BASE}/${endpointId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai inference failed for ${endpointId}: ${parseFalError(res.status, text)}`);
  }

  return (await res.json()) as T;
}

/**
 * Format a base64 image as a data URI for use in fal.ai image_url fields.
 * fal.ai accepts data URIs directly, so no upload is needed.
 */
export function uploadImageToFal(imageBase64: string): string {
  if (imageBase64.startsWith("data:")) return imageBase64;
  return `data:image/png;base64,${imageBase64}`;
}
