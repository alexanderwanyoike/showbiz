import { describe, it, expect, vi } from "vitest";
import {
  createTaskQueue,
  createSeekCoalescer,
  waitForMediaEvent,
  snapToKeyframeGrid,
  fetchCompleteBlob,
} from "./media-pipeline";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createTaskQueue", () => {
  it("runs tasks and returns their results", async () => {
    const queue = createTaskQueue(1);
    await expect(queue.run(async () => 42)).resolves.toBe(42);
  });

  it("never runs more tasks than the concurrency limit", async () => {
    const queue = createTaskQueue(2);
    let active = 0;
    let maxActive = 0;
    const gate = deferred<void>();

    const tasks = Array.from({ length: 5 }, () =>
      queue.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active -= 1;
      })
    );

    // Give queued tasks a chance to (incorrectly) start
    await new Promise((r) => setTimeout(r, 10));
    expect(maxActive).toBe(2);

    gate.resolve();
    await Promise.all(tasks);
    expect(maxActive).toBe(2);
  });

  it("keeps draining after a task fails", async () => {
    const queue = createTaskQueue(1);
    await expect(queue.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(queue.run(async () => "next")).resolves.toBe("next");
  });

  it("runs tasks in submission order at concurrency 1", async () => {
    const queue = createTaskQueue(1);
    const order: number[] = [];
    await Promise.all([
      queue.run(async () => {
        order.push(1);
      }),
      queue.run(async () => {
        order.push(2);
      }),
      queue.run(async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("snapToKeyframeGrid", () => {
  it("rounds to the nearest keyframe on the normalized 0.5s cadence", () => {
    expect(snapToKeyframeGrid(3.8)).toBe(4);
    expect(snapToKeyframeGrid(3.7)).toBe(3.5);
    expect(snapToKeyframeGrid(0.2)).toBe(0);
  });

  it("clamps into the given window", () => {
    expect(snapToKeyframeGrid(0.1, 0.5, 8)).toBe(0.5);
    expect(snapToKeyframeGrid(7.9, 0, 7.6)).toBe(7.5);
  });
});

describe("fetchCompleteBlob", () => {
  const blobOf = (size: number) => new Blob([new Uint8Array(size)]);
  const responseOf = (size: number, contentLength: number | null) => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-length" && contentLength !== null ? String(contentLength) : null) },
    blob: () => Promise.resolve(blobOf(size)),
  });

  it("returns the blob when its size matches content-length", async () => {
    const fetcher = vi.fn().mockResolvedValue(responseOf(1000, 1000));
    const blob = await fetchCompleteBlob("asset://a.mp4", fetcher as unknown as typeof fetch);
    expect(blob.size).toBe(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches when the blob is shorter than content-length (torn read)", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(responseOf(400, 1000))
      .mockResolvedValueOnce(responseOf(1000, 1000));
    const blob = await fetchCompleteBlob("asset://a.mp4", fetcher as unknown as typeof fetch);
    expect(blob.size).toBe(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("accepts responses without a content-length header", async () => {
    const fetcher = vi.fn().mockResolvedValue(responseOf(1000, null));
    const blob = await fetchCompleteBlob("asset://a.mp4", fetcher as unknown as typeof fetch);
    expect(blob.size).toBe(1000);
  });

  it("throws after exhausting retries on persistent short reads", async () => {
    const fetcher = vi.fn().mockResolvedValue(responseOf(400, 1000));
    await expect(
      fetchCompleteBlob("asset://a.mp4", fetcher as unknown as typeof fetch)
    ).rejects.toThrow(/incomplete/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("throws on non-ok responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      fetchCompleteBlob("asset://a.mp4", fetcher as unknown as typeof fetch)
    ).rejects.toThrow(/404/);
  });
});

describe("waitForMediaEvent", () => {
  it("resolves 'event' when the awaited event fires", async () => {
    const el = new EventTarget();
    const wait = waitForMediaEvent(el, "seeked", 1000);
    el.dispatchEvent(new Event("seeked"));
    await expect(wait).resolves.toBe("event");
  });

  it("resolves 'error' when the element errors instead", async () => {
    const el = new EventTarget();
    const wait = waitForMediaEvent(el, "seeked", 1000);
    el.dispatchEvent(new Event("error"));
    await expect(wait).resolves.toBe("error");
  });

  // The load-bearing case: WebKitGTK can permanently fail to fire `seeked`
  // on a stalled pipeline. An unbounded wait deadlocks the whole player.
  it("resolves 'timeout' when the event never fires", async () => {
    vi.useFakeTimers();
    try {
      const el = new EventTarget();
      const wait = waitForMediaEvent(el, "seeked", 500);
      vi.advanceTimersByTime(600);
      await expect(wait).resolves.toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not leak listeners or timers after resolving", async () => {
    vi.useFakeTimers();
    try {
      const el = new EventTarget();
      const wait = waitForMediaEvent(el, "seeked", 500);
      el.dispatchEvent(new Event("seeked"));
      await expect(wait).resolves.toBe("event");
      // Firing again after resolution must not throw or double-resolve
      el.dispatchEvent(new Event("seeked"));
      vi.advanceTimersByTime(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createSeekCoalescer", () => {
  it("applies a seek immediately when idle", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const coalescer = createSeekCoalescer(apply);
    await coalescer.request(3.5);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(3.5);
  });

  it("coalesces requests made while a seek is in flight to the latest target", async () => {
    const first = deferred<void>();
    const apply = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const coalescer = createSeekCoalescer(apply);

    const initial = coalescer.request(1);
    // A scrub storm arrives while the first seek is decoding
    coalescer.request(2);
    coalescer.request(3);
    coalescer.request(4);

    first.resolve();
    await initial;
    await new Promise((r) => setTimeout(r, 0));

    // Only the latest queued target is applied, intermediate ones are dropped
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(4);
  });

  it("recovers when an applied seek rejects", async () => {
    const apply = vi
      .fn()
      .mockRejectedValueOnce(new Error("seek failed"))
      .mockResolvedValue(undefined);
    const coalescer = createSeekCoalescer(apply);

    await coalescer.request(1).catch(() => {});
    await coalescer.request(2);
    expect(apply).toHaveBeenLastCalledWith(2);
  });
});
