import { describe, it, expect, vi } from "vitest";
import { resolveSeekAction } from "./seek-utils";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
}));

describe("resolveSeekAction", () => {
  it("returns shouldReload=true when file differs", () => {
    const r = resolveSeekAction("asset://localhost/%2Ftmp%2Fa.mp4", "/tmp/b.mp4");
    expect(r.shouldReload).toBe(true);
    expect(r.path).toBe("/tmp/a.mp4");
  });

  it("returns shouldReload=false when same file", () => {
    const r = resolveSeekAction("asset://localhost/%2Ftmp%2Fa.mp4", "/tmp/a.mp4");
    expect(r.shouldReload).toBe(false);
  });

  it("handles plain absolute path (no asset:// prefix)", () => {
    const r = resolveSeekAction("/tmp/a.mp4", "/tmp/a.mp4");
    expect(r.shouldReload).toBe(false);
  });
});
