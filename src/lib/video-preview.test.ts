import { describe, expect, it } from "vitest";
import { clampPlaybackTime, formatPlaybackTime, resolvePreviewStill } from "./video-preview";

describe("video preview helpers", () => {
  it("formats playback time as minutes and seconds", () => {
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(7.9)).toBe("0:07");
    expect(formatPlaybackTime(65.2)).toBe("1:05");
  });

  it("falls back for invalid playback time", () => {
    expect(formatPlaybackTime(null)).toBe("0:00");
    expect(formatPlaybackTime(Number.NaN)).toBe("0:00");
    expect(formatPlaybackTime(-1)).toBe("0:00");
  });

  it("clamps seek time to a loaded duration", () => {
    expect(clampPlaybackTime(-3, 8)).toBe(0);
    expect(clampPlaybackTime(4, 8)).toBe(4);
    expect(clampPlaybackTime(10, 8)).toBe(8);
  });

  it("uses a video poster when a shot image is missing", () => {
    expect(resolvePreviewStill("asset://image.jpg", "data:image/jpeg;base64,poster")).toBe(
      "asset://image.jpg"
    );
    expect(resolvePreviewStill(null, "data:image/jpeg;base64,poster")).toBe(
      "data:image/jpeg;base64,poster"
    );
    expect(resolvePreviewStill(null, null)).toBeNull();
  });
});
