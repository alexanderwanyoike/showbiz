import { describe, it, expect, vi } from "vitest";
import { createObjectUrlCache } from "./object-url-cache";

function makeCache(overrides: {
  fetcher?: (url: string) => Promise<Blob>;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
} = {}) {
  let seq = 0;
  const created: string[] = [];
  const revoked: string[] = [];
  const fetcher = overrides.fetcher ?? vi.fn().mockResolvedValue(new Blob(["x"]));
  const createUrl =
    overrides.createUrl ??
    (() => {
      const url = `blob:test-${++seq}`;
      created.push(url);
      return url;
    });
  const revokeUrl = overrides.revokeUrl ?? ((url: string) => revoked.push(url));
  const cache = createObjectUrlCache(fetcher, createUrl, revokeUrl);
  return { cache, fetcher, created, revoked };
}

describe("createObjectUrlCache", () => {
  it("returns an object URL for a fetched video", async () => {
    const { cache } = makeCache();
    await expect(cache.get("asset://a.mp4")).resolves.toBe("blob:test-1");
  });

  it("fetches each source URL only once", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Blob(["x"]));
    const { cache } = makeCache({ fetcher });
    await cache.get("asset://a.mp4");
    await cache.get("asset://a.mp4");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shares one fetch between concurrent callers", async () => {
    let resolveFetch!: (b: Blob) => void;
    const fetcher = vi.fn(() => new Promise<Blob>((resolve) => (resolveFetch = resolve)));
    const { cache } = makeCache({ fetcher });
    const first = cache.get("asset://a.mp4");
    const second = cache.get("asset://a.mp4");
    resolveFetch(new Blob(["x"]));
    expect(await first).toBe(await second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed fetches, so they retry", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(new Blob(["x"]));
    const { cache } = makeCache({ fetcher });
    await expect(cache.get("asset://a.mp4")).rejects.toThrow("boom");
    await expect(cache.get("asset://a.mp4")).resolves.toBe("blob:test-1");
  });

  it("revokeAll revokes every created URL and clears the cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Blob(["x"]));
    const { cache, revoked } = makeCache({ fetcher });
    await cache.get("asset://a.mp4");
    await cache.get("asset://b.mp4");

    await cache.revokeAll();
    expect(revoked).toEqual(["blob:test-1", "blob:test-2"]);

    // Cache is empty: the next get re-fetches
    await cache.get("asset://a.mp4");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
