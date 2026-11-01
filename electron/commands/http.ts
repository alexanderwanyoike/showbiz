import { Agent } from "undici";

/**
 * Cross-origin HTTP proxy for the Electron shell. Ports
 * the retired Rust backend's commands/http_client.rs: a thin main-process fetch that
 * completely bypasses the renderer, returning the body as base64.
 *
 * Request/response JSON shapes match the Rust command exactly (same signature
 * first; multipart liberation is a later cleanup per the migration plan).
 */

type Header = [string, string];

const inferenceDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

interface HttpRequestArgs {
  url: string;
  method: string;
  headers: Header[];
  body: string | null;
  timeout_ms?: number;
}

interface HttpResponse {
  status: number;
  body_b64: string;
  headers?: Header[];
}

/** Minimal shape the proxy reads from a fetch Response (status + bytes). */
interface FetchResponseLike {
  status: number;
  headers?: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<FetchResponseLike>;

function messageOf(error: unknown, depth = 0): string {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof Error && error.cause && depth < 3 ? `${message}: ${messageOf(error.cause, depth + 1)}` : message;
}

/**
 * Pure mapping from the command args to the fetch call arguments. Kept separate
 * from the network call so it is unit-testable without a real fetch: headers and
 * body pass through untouched, and a null body is omitted (fetch forbids a body
 * on GET/HEAD, and the caller sends null for those).
 *
 * Two dormant divergences from the Rust reqwest proxy, unhit by any current
 * caller: fetch throws on a non-null GET/HEAD body (reqwest allowed it), and
 * fetch's Headers folds duplicate header names into one comma-joined line
 * (reqwest kept separate lines).
 */
export function buildFetchArgs(args: HttpRequestArgs): {
  url: string;
  init: Record<string, unknown>;
} {
  const init: Record<string, unknown> = {
    method: args.method,
    headers: args.headers,
  };
  if (args.timeout_ms !== undefined) {
    if (!Number.isSafeInteger(args.timeout_ms) || args.timeout_ms < 1 || args.timeout_ms > 3600000) throw new Error("Choose an HTTP timeout between 1 millisecond and 1 hour.");
    init.dispatcher = inferenceDispatcher;
    init.signal = AbortSignal.timeout(args.timeout_ms);
  }
  if (args.body !== null && args.body !== undefined) {
    init.body = args.body;
  }
  return { url: args.url, init };
}

/** Pure mapping from status + raw bytes to the Rust HttpResponse JSON shape. */
export function encodeResponse(status: number, bytes: Uint8Array): HttpResponse {
  return { status, body_b64: Buffer.from(bytes).toString("base64") };
}

export function createHttpCommands(fetchFn: FetchFn = fetch as unknown as FetchFn) {
  return {
    async http_request(rawArgs?: Record<string, unknown>): Promise<HttpResponse> {
      const args = (rawArgs ?? {}) as unknown as HttpRequestArgs;
      const { url, init } = buildFetchArgs(args);

      let response: FetchResponseLike;
      try {
        response = await fetchFn(url, init);
      } catch (error) {
        throw new Error(`Network error: ${messageOf(error)}`);
      }

      let buffer: ArrayBuffer;
      try {
        buffer = await response.arrayBuffer();
      } catch (error) {
        throw new Error(`Failed to read response body: ${messageOf(error)}`);
      }

      const encoded = encodeResponse(response.status, new Uint8Array(buffer));
      const headers: Header[] = [];
      for (const name of ["content-type", "x-fal-request-id"]) {
        const value = response.headers?.get(name);
        if (value) headers.push([name, value]);
      }
      return headers.length ? { ...encoded, headers } : encoded;
    },
  };
}
