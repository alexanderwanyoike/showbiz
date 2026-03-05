export interface PollOptions<T> {
  /** Function that checks whether the async operation is done. */
  check: () => Promise<{ done: true; value: T } | { done: false }>;
  /** Initial polling interval in ms. */
  initialInterval: number;
  /** Maximum polling interval in ms. */
  maxInterval: number;
  /** Overall timeout in ms — rejects if exceeded. */
  timeout: number;
  /** Backoff strategy between polls. */
  backoff:
    | { type: "exponential"; factor: number }
    | { type: "linear"; increment: number };
  /** Optional label for timeout error messages. */
  label?: string;
}

/**
 * Generic poll-until-done loop with configurable backoff.
 * Used by fal, replicate, and other async provider transports.
 */
export async function pollUntilDone<T>(options: PollOptions<T>): Promise<T> {
  const { check, initialInterval, maxInterval, timeout, backoff, label } = options;
  const start = Date.now();
  let interval = initialInterval;

  while (true) {
    const result = await check();
    if (result.done) {
      return result.value;
    }

    if (Date.now() - start >= timeout) {
      const tag = label ? ` (${label})` : "";
      throw new Error(`Polling timed out after ${timeout}ms${tag}`);
    }

    await new Promise((r) => setTimeout(r, interval));

    if (backoff.type === "exponential") {
      interval = Math.min(interval * backoff.factor, maxInterval);
    } else {
      interval = Math.min(interval + backoff.increment, maxInterval);
    }
  }
}
