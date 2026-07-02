import { describe, it, expect, vi } from "vitest";
import { createTaskQueue, createSeekCoalescer } from "./media-pipeline";

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
