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

export function createSeekCoalescer(applySeek: (target: number) => Promise<void>) {
  let inFlight = false;
  let queuedTarget: number | null = null;

  const request = async (target: number): Promise<void> => {
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

export type SeekCoalescer = ReturnType<typeof createSeekCoalescer>;

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
