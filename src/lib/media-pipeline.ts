/**
 * WebKitGTK media pipeline hygiene.
 *
 * Every <video> element spins up a GStreamer software-decode pipeline
 * (DMA-BUF is disabled for the hybrid-GPU bug), and only a handful can run
 * concurrently before loads and seeks silently stall. Two utilities keep the
 * app inside that budget:
 *
 * - createTaskQueue caps how many transient probe pipelines (thumbnails,
 *   duration probes) run at once.
 * - createSeekCoalescer stops scrub storms from stacking seeks on a playback
 *   element: while one seek is decoding, newer targets replace each other and
 *   only the latest is applied when the element is ready again.
 */

/** Normalized videos carry a keyframe every 0.5s (video_normalize.rs GOP 12 @ 24fps) */
export const KEYFRAME_INTERVAL_SECS = 0.5;

/**
 * Snap a source-file time onto the keyframe cadence, clamped to a window.
 * Keyframe decodes need no reference buffers, so seeking to them sidesteps
 * WebKitGTK's recycled-buffer smear (deltas applied onto a stale frame from
 * a previous pipeline) during paused scrub previews.
 */
export function snapToKeyframeGrid(
  time: number,
  min = 0,
  max = Number.POSITIVE_INFINITY
): number {
  const snapped = Math.round(time / KEYFRAME_INTERVAL_SECS) * KEYFRAME_INTERVAL_SECS;
  return Math.min(Math.max(snapped, Math.ceil(min / KEYFRAME_INTERVAL_SECS) * KEYFRAME_INTERVAL_SECS), Math.floor(max / KEYFRAME_INTERVAL_SECS) * KEYFRAME_INTERVAL_SECS);
}

/**
 * Fetch a media file as a Blob, verifying it arrived complete. Under mount
 * bursts the Tauri asset protocol can deliver torn reads (blob shorter than
 * content-length), which then fail every element that consumes the blob;
 * verifying and refetching at the source is the only reliable place to fix it.
 */
export async function fetchCompleteBlob(
  url: string,
  fetcher: typeof fetch = (...args) => window.fetch(...args),
  attempts = 3
): Promise<Blob> {
  let lastError: Error = new Error("fetch not attempted");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetcher(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video (${response.status}): ${url}`);
    }
    const expected = Number(response.headers.get("content-length"));
    const blob = await response.blob();
    if (!Number.isFinite(expected) || expected <= 0 || blob.size === expected) {
      return blob;
    }
    lastError = new Error(
      `incomplete media read (${blob.size}/${expected} bytes): ${url}`
    );
    console.warn(`[media] ${lastError.message}, attempt ${attempt + 1}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  throw lastError;
}

export type MediaWaitOutcome = "event" | "error" | "timeout";

/**
 * Await a media element event with a hard deadline. WebKitGTK's stalled
 * pipelines can permanently swallow `seeked`/`loadedmetadata`; an unbounded
 * wait deadlocks whatever awaits it, so every media wait in the app goes
 * through this and handles the "timeout" outcome explicitly.
 */
export function waitForMediaEvent(
  el: EventTarget,
  event: string,
  timeoutMs: number
): Promise<MediaWaitOutcome> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const settle = (outcome: MediaWaitOutcome) => {
      clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
      resolve(outcome);
    };
    const onEvent = () => settle("event");
    const onError = () => settle("error");
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
    timer = setTimeout(() => settle("timeout"), timeoutMs);
  });
}

export function createTaskQueue(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < concurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(() => {
      active += 1;
      resolve();
    }));
  };

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

export type TaskQueue = ReturnType<typeof createTaskQueue>;

/**
 * Global gate for OPENING media pipelines (setting src / awaiting metadata).
 * WebKitGTK's element opens fail sporadically when several race; one at a
 * time is reliable. Seeks and playback on already-open elements are not
 * gated.
 */
export const mediaOpenQueue = createTaskQueue(1);

export function createSeekCoalescer<T = number>(applySeek: (target: T) => Promise<void>) {
  let inFlight = false;
  let queuedTarget: T | null = null;

  const request = async (target: T): Promise<void> => {
    if (inFlight) {
      queuedTarget = target;
      return;
    }
    inFlight = true;
    try {
      await applySeek(target);
    } finally {
      inFlight = false;
    }
    if (queuedTarget !== null) {
      const next = queuedTarget;
      queuedTarget = null;
      await request(next);
    }
  };

  return { request };
}

export type SeekCoalescer<T = number> = ReturnType<typeof createSeekCoalescer<T>>;

/**
 * Fully release a transient <video> element's decode pipeline instead of
 * waiting for garbage collection. Without this, probe elements accumulate
 * live GStreamer pipelines and starve the actual players.
 */
export function releaseVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
}
