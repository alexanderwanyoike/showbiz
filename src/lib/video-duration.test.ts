import { describe, it, expect, vi } from "vitest";
import { createVideoDurationCache } from "./video-duration";

describe("createVideoDurationCache", () => {
  it("returns the probed duration", async () => {
    const prober = vi.fn().mockResolvedValue(5.2);
    const cache = createVideoDurationCache(prober);
    await expect(cache.get("asset://a.mp4")).resolves.toBe(5.2);
  });

  it("probes each URL only once", async () => {
    const prober = vi.fn().mockResolvedValue(5.2);
    const cache = createVideoDurationCache(prober);
    await cache.get("asset://a.mp4");
    await cache.get("asset://a.mp4");
    expect(prober).toHaveBeenCalledTimes(1);
  });

  it("shares a single probe between concurrent calls", async () => {
    let resolveProbe!: (d: number) => void;
    const prober = vi.fn(
      () => new Promise<number>((resolve) => (resolveProbe = resolve))
    );
    const cache = createVideoDurationCache(prober);
    const first = cache.get("asset://a.mp4");
    const second = cache.get("asset://a.mp4");
    resolveProbe(3.5);
    await expect(first).resolves.toBe(3.5);
    await expect(second).resolves.toBe(3.5);
    expect(prober).toHaveBeenCalledTimes(1);
  });

  it("probes different URLs independently", async () => {
    const prober = vi
      .fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7);
    const cache = createVideoDurationCache(prober);
    await expect(cache.get("asset://a.mp4")).resolves.toBe(3);
    await expect(cache.get("asset://b.mp4")).resolves.toBe(7);
    expect(prober).toHaveBeenCalledTimes(2);
  });

  it("returns null on probe failure and retries next time", async () => {
    const prober = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(4);
    const cache = createVideoDurationCache(prober);
    await expect(cache.get("asset://a.mp4")).resolves.toBeNull();
    await expect(cache.get("asset://a.mp4")).resolves.toBe(4);
    expect(prober).toHaveBeenCalledTimes(2);
  });

  it("treats a non-positive probe result as a failure and retries", async () => {
    const prober = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(6);
    const cache = createVideoDurationCache(prober);
    await expect(cache.get("asset://a.mp4")).resolves.toBeNull();
    await expect(cache.get("asset://a.mp4")).resolves.toBe(6);
  });
});
