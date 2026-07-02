import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoBlobUrl, revokeVideoBlobUrl } from "./video-blob-url";

describe("video blob url", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the asset url and turns the response blob into an object url", async () => {
    const mockBlob = new Blob(["video-bytes"]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(mockBlob),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createVideoBlobUrl("asset://localhost/video.mp4");

    expect(fetchMock).toHaveBeenCalledWith("asset://localhost/video.mp4");
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(result).toBe("blob:mock-url");
  });

  it("throws when the fetch response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(createVideoBlobUrl("asset://localhost/missing.mp4")).rejects.toThrow(/404/);
  });

  it("revokes a blob url when given one", () => {
    revokeVideoBlobUrl("blob:mock-url");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("does nothing when given null", () => {
    revokeVideoBlobUrl(null);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
