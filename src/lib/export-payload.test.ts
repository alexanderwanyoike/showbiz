import { describe, it, expect } from "vitest";
import { buildExportClips, parseExportSettings } from "./export-payload";
import type { TimelineClip, Shot } from "./timeline-utils";

function shot(id: string): Shot {
  return {
    id,
    storyboard_id: "sb",
    order: 0,
    duration: 5,
    image_prompt: null,
    image_url: null,
    video_prompt: null,
    video_url: `blob:${id}`,
    status: "complete",
  };
}

function clip(overrides: Partial<TimelineClip> & { clipId: string; shotId: string }): TimelineClip {
  const { clipId, shotId, ...rest } = overrides;
  return {
    clipId,
    shot: shot(shotId),
    videoUrl: `blob:${shotId}`,
    videoVersionId: null,
    sourceDuration: 5,
    trimIn: 0,
    trimOut: 5,
    effectiveDuration: 5,
    startOffset: 0,
    track: "V1",
    ...rest,
  };
}

describe("buildExportClips", () => {
  it("orders clips by timeline position and maps identity + trim + offset", () => {
    const clips: TimelineClip[] = [
      clip({ clipId: "c-late", shotId: "s-late", startOffset: 4, trimIn: 1, trimOut: 3 }),
      clip({ clipId: "c-early", shotId: "s-early", startOffset: 0, videoVersionId: "ver-1" }),
    ];
    const payload = buildExportClips(clips);
    expect(payload).toEqual([
      { shotId: "s-early", videoVersionId: "ver-1", track: "V1", trimIn: 0, trimOut: 5, startOffset: 0 },
      { shotId: "s-late", videoVersionId: null, track: "V1", trimIn: 1, trimOut: 3, startOffset: 4 },
    ]);
  });

  it("breaks same-start ties by track priority (video over audio, higher first)", () => {
    const clips: TimelineClip[] = [
      clip({ clipId: "a", shotId: "s-a", track: "A1", startOffset: 0 }),
      clip({ clipId: "v2", shotId: "s-v2", track: "V2", startOffset: 0 }),
      clip({ clipId: "v1", shotId: "s-v1", track: "V1", startOffset: 0 }),
    ];
    expect(buildExportClips(clips).map((c) => c.shotId)).toEqual(["s-v2", "s-v1", "s-a"]);
  });

  it("drops clips without a resolved source video", () => {
    const clips: TimelineClip[] = [
      clip({ clipId: "ok", shotId: "s-ok" }),
      clip({ clipId: "pending", shotId: "s-pending", videoUrl: null }),
    ];
    expect(buildExportClips(clips).map((c) => c.shotId)).toEqual(["s-ok"]);
  });
});

describe("parseExportSettings", () => {
  it("parses positive numeric fields", () => {
    expect(
      parseExportSettings({ width: "1920", height: "1080", fps: "30", preset: "fast" })
    ).toEqual({ width: 1920, height: 1080, fps: 30, preset: "fast" });
  });

  it("leaves blank or invalid fields undefined for probing", () => {
    expect(parseExportSettings({ width: "", height: "0", fps: "abc", preset: "" })).toEqual({
      width: undefined,
      height: undefined,
      fps: undefined,
      preset: "medium",
    });
  });
});
