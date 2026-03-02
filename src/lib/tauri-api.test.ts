import { describe, it, expect, vi } from "vitest";
import { assetUrlToPath } from "./tauri-api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
}));

describe("assetUrlToPath", () => {
  it("decodes a standard asset URL", () => {
    expect(
      assetUrlToPath("asset://localhost/%2Fhome%2Fuser%2Fvideo.mp4?t=123")
    ).toBe("/home/user/video.mp4");
  });

  it("returns a path for non-asset URLs", () => {
    expect(assetUrlToPath("https://example.com/video.mp4")).not.toBe(null);
  });

  it("strips the query string", () => {
    const path = assetUrlToPath("asset://localhost/%2Ftmp%2Ftest.mp4?t=9999999");
    expect(path).toBe("/tmp/test.mp4");
    expect(path).not.toContain("?");
  });
});
