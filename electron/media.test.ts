import { describe, it, expect } from "vitest";
import { resolveMediaPath } from "./media";

describe("resolveMediaPath", () => {
  const base = "/data/showbiz/media";

  it("resolves a relative path inside the media directory", () => {
    expect(resolveMediaPath(base, "videos/shot-1.mp4")).toBe(
      "/data/showbiz/media/videos/shot-1.mp4"
    );
  });

  it("allows internal .. segments that stay inside the base", () => {
    expect(resolveMediaPath(base, "videos/../images/shot-1.png")).toBe(
      "/data/showbiz/media/images/shot-1.png"
    );
  });

  it("rejects traversal that escapes the media directory", () => {
    expect(() => resolveMediaPath(base, "../../etc/passwd")).toThrow(/escapes/i);
  });

  it("rejects absolute paths", () => {
    expect(() => resolveMediaPath(base, "/etc/passwd")).toThrow(/absolute/i);
  });

  it("rejects a path that resolves to the base directory itself", () => {
    expect(() => resolveMediaPath(base, ".")).toThrow(/escapes/i);
  });
});
