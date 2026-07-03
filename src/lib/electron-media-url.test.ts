import { describe, expect, it, vi } from "vitest";
import { createElectronMediaUrlResolver } from "./electron-media-url";

function makeResolver() {
  const readMediaBytes = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
  const createObjectURL = vi
    .fn()
    .mockReturnValueOnce("blob:one")
    .mockReturnValueOnce("blob:two");
  const revokeObjectURL = vi.fn();
  const resolver = createElectronMediaUrlResolver({
    getMediaBasePath: () => Promise.resolve("/home/user/.local/share/com.showbiz.app/media"),
    readMediaBytes,
    createObjectURL,
    revokeObjectURL,
  });

  return { resolver, readMediaBytes, createObjectURL, revokeObjectURL };
}

describe("electron media URL resolver", () => {
  it("reads a media file by relative path and returns a blob URL", async () => {
    const { resolver, readMediaBytes, createObjectURL } = makeResolver();

    await expect(
      resolver.resolve("/home/user/.local/share/com.showbiz.app/media/images/shot-1.png")
    ).resolves.toBe("blob:one");

    expect(readMediaBytes).toHaveBeenCalledWith("images/shot-1.png");
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(createObjectURL.mock.calls[0][0].type).toBe("image/png");
  });

  it("caches blob URLs per absolute path", async () => {
    const { resolver, readMediaBytes } = makeResolver();
    const path = "/home/user/.local/share/com.showbiz.app/media/videos/shot-1.mp4";

    await expect(resolver.resolve(path)).resolves.toBe("blob:one");
    await expect(resolver.resolve(path)).resolves.toBe("blob:one");

    expect(readMediaBytes).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight read between concurrent callers", async () => {
    let resolveRead!: (bytes: Uint8Array) => void;
    const readMediaBytes = vi.fn(
      () => new Promise<Uint8Array>((resolve) => (resolveRead = resolve))
    );
    const resolver = createElectronMediaUrlResolver({
      getMediaBasePath: () => Promise.resolve("/media"),
      readMediaBytes,
      createObjectURL: () => "blob:shared",
      revokeObjectURL: vi.fn(),
    });

    const first = resolver.resolve("/media/videos/a.webm");
    const second = resolver.resolve("/media/videos/a.webm");
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveRead(new Uint8Array([4, 5, 6]));

    await expect(first).resolves.toBe("blob:shared");
    await expect(second).resolves.toBe("blob:shared");
    expect(readMediaBytes).toHaveBeenCalledTimes(1);
  });

  it("evicts failed reads so the next resolve retries", async () => {
    const readMediaBytes = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(new Uint8Array([1]));
    const resolver = createElectronMediaUrlResolver({
      getMediaBasePath: () => Promise.resolve("/media"),
      readMediaBytes,
      createObjectURL: () => "blob:retry",
      revokeObjectURL: vi.fn(),
    });

    await expect(resolver.resolve("/media/videos/a.mp4")).rejects.toThrow("missing");
    await expect(resolver.resolve("/media/videos/a.mp4")).resolves.toBe("blob:retry");
    expect(readMediaBytes).toHaveBeenCalledTimes(2);
  });

  it("invalidates and revokes a cached blob URL", async () => {
    const { resolver, readMediaBytes, revokeObjectURL } = makeResolver();
    const path = "/home/user/.local/share/com.showbiz.app/media/videos/shot-1.mp4";

    await resolver.resolve(path);
    resolver.invalidate(path);
    await Promise.resolve();
    await resolver.resolve(path);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:one");
    expect(readMediaBytes).toHaveBeenCalledTimes(2);
  });

  it("rejects absolute paths outside the media directory", async () => {
    const { resolver } = makeResolver();

    await expect(resolver.resolve("/home/user/other/shot-1.png")).rejects.toThrow(
      /outside the media directory/
    );
  });
});
