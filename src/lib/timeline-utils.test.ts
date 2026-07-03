import { describe, it, expect } from "vitest";
import {
  buildTimelineClipsFromExplicit,
  getTotalDuration,
  getActiveClipAtTime,
  getNextClipAfterTime,
  resolvePlaybackStart,
  resolvePlayheadState,
  getFollowingClip,
  snapStartTime,
  orderClipsForExport,
  computeClipSplit,
  trackPriority,
  formatTime,
  type Shot,
  type TimelineClip,
  type TimelineClipEntry,
} from "./timeline-utils";

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "shot-1",
    storyboard_id: "sb-1",
    order: 1,
    duration: 8,
    image_prompt: null,
    image_url: null,
    video_prompt: null,
    video_url: "asset://video.mp4",
    status: "complete",
    ...overrides,
  };
}

let entrySeq = 0;
function makeEntry(overrides: Partial<TimelineClipEntry> = {}): TimelineClipEntry {
  entrySeq += 1;
  return {
    clipId: `clip-${entrySeq}`,
    shotId: "shot-1",
    track: "V1",
    startTime: 0,
    trimIn: null,
    trimOut: null,
    videoVersionId: null,
    ...overrides,
  };
}

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  const shot = overrides.shot ?? makeShot();
  const sourceDuration = overrides.sourceDuration ?? shot.duration;
  const trimIn = overrides.trimIn ?? 0;
  const trimOut = overrides.trimOut ?? sourceDuration;
  entrySeq += 1;
  return {
    clipId: overrides.clipId ?? `clip-${entrySeq}`,
    shot,
    videoUrl: shot.video_url,
    videoVersionId: null,
    sourceDuration,
    trimIn,
    trimOut,
    effectiveDuration: overrides.effectiveDuration ?? trimOut - trimIn,
    startOffset: overrides.startOffset ?? 0,
    track: overrides.track ?? "V1",
    ...overrides,
  };
}

describe("buildTimelineClipsFromExplicit", () => {
  it("returns empty array when no entries", () => {
    const clips = buildTimelineClipsFromExplicit([], [makeShot({ id: "s1" })]);
    expect(clips).toHaveLength(0);
  });

  it("builds clips keyed by their row id", () => {
    const shots = [makeShot({ id: "s1" })];
    const entries = [makeEntry({ clipId: "row-9", shotId: "s1", startTime: 4 })];
    const clips = buildTimelineClipsFromExplicit(entries, shots);
    expect(clips).toHaveLength(1);
    expect(clips[0].clipId).toBe("row-9");
    expect(clips[0].startOffset).toBe(4);
  });

  it("skips entries for missing or incomplete shots", () => {
    const shots = [
      makeShot({ id: "pending", status: "pending" }),
      makeShot({ id: "no-video", video_url: null }),
    ];
    const entries = [
      makeEntry({ shotId: "missing" }),
      makeEntry({ shotId: "pending" }),
      makeEntry({ shotId: "no-video" }),
    ];
    expect(buildTimelineClipsFromExplicit(entries, shots)).toHaveLength(0);
  });

  it("applies per-clip trims so the same shot can differ per instance", () => {
    const shots = [makeShot({ id: "s1" })];
    const entries = [
      makeEntry({ clipId: "a", shotId: "s1", trimIn: 0, trimOut: 3 }),
      makeEntry({ clipId: "b", shotId: "s1", startTime: 10, trimIn: 4, trimOut: 8 }),
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots);
    expect(clips[0].effectiveDuration).toBe(3);
    expect(clips[1].trimIn).toBe(4);
    expect(clips[1].effectiveDuration).toBe(4);
  });

  it("resolves a pinned version's URL and skips playback URL when unknown", () => {
    const shots = [makeShot({ id: "s1", video_url: "asset://current.mp4" })];
    const entries = [
      makeEntry({ clipId: "pinned", shotId: "s1", videoVersionId: "v2" }),
      makeEntry({ clipId: "loading", shotId: "s1", videoVersionId: "v9" }),
      makeEntry({ clipId: "current", shotId: "s1" }),
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, {}, { v2: "asset://v2.mp4" });
    expect(clips.find((c) => c.clipId === "pinned")!.videoUrl).toBe("asset://v2.mp4");
    expect(clips.find((c) => c.clipId === "loading")!.videoUrl).toBeNull();
    expect(clips.find((c) => c.clipId === "current")!.videoUrl).toBe("asset://current.mp4");
  });

  it("uses the probed duration of the resolved URL, not the shot's", () => {
    const shots = [makeShot({ id: "s1", duration: 8, video_url: "asset://current.mp4" })];
    const entries = [makeEntry({ clipId: "p", shotId: "s1", videoVersionId: "v2" })];
    const clips = buildTimelineClipsFromExplicit(
      entries,
      shots,
      { "asset://v2.mp4": 5.2, "asset://current.mp4": 7.5 },
      { v2: "asset://v2.mp4" }
    );
    expect(clips[0].sourceDuration).toBe(5.2);
    expect(clips[0].trimOut).toBe(5.2);
  });

  it("clamps persisted trims to the real duration", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const entries = [makeEntry({ shotId: "s1", trimIn: 6, trimOut: 8 })];
    const clips = buildTimelineClipsFromExplicit(entries, shots, {
      "asset://video.mp4": 5,
    });
    expect(clips[0].trimIn).toBe(5);
    expect(clips[0].trimOut).toBe(5);
    expect(clips[0].effectiveDuration).toBe(0);
  });

  it("falls back to shot.duration when nothing is probed", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const clips = buildTimelineClipsFromExplicit([makeEntry({ shotId: "s1" })], shots);
    expect(clips[0].sourceDuration).toBe(8);
    expect(clips[0].trimOut).toBe(8);
  });
});

describe("trackPriority", () => {
  it("V2 > V1", () => {
    expect(trackPriority("V2")).toBeGreaterThan(trackPriority("V1"));
  });

  it("V10 > V2", () => {
    expect(trackPriority("V10")).toBeGreaterThan(trackPriority("V2"));
  });

  it("video tracks have higher priority than audio tracks", () => {
    expect(trackPriority("V1")).toBeGreaterThan(trackPriority("A1"));
  });

  it("audio tracks have positive priority based on number", () => {
    expect(trackPriority("A2")).toBeGreaterThan(trackPriority("A1"));
  });
});

describe("getTotalDuration", () => {
  it("returns 0 for empty array", () => {
    expect(getTotalDuration([])).toBe(0);
  });

  it("sums clip durations on one track", () => {
    const clips = [
      makeClip({ trimOut: 3, startOffset: 0 }),
      makeClip({ trimOut: 5, startOffset: 3 }),
    ];
    expect(getTotalDuration(clips)).toBe(8);
  });

  it("returns max of per-track durations, not sum", () => {
    const clips = [
      makeClip({ startOffset: 0, track: "V1" }),
      makeClip({ startOffset: 8, track: "V1" }),
      makeClip({ startOffset: 0, track: "V2" }),
    ];
    expect(getTotalDuration(clips)).toBe(16);
  });
});

describe("getActiveClipAtTime", () => {
  it("returns V2 clip when V1 and V2 both cover time", () => {
    const clips = [
      makeClip({ clipId: "c1", startOffset: 0, track: "V1" }),
      makeClip({ clipId: "c2", startOffset: 0, track: "V2" }),
    ];
    const result = getActiveClipAtTime(2, clips);
    expect(result!.clip.clipId).toBe("c2");
  });

  it("returns V1 clip when V2 has ended", () => {
    const clips = [
      makeClip({ clipId: "long", sourceDuration: 16, startOffset: 0, track: "V1" }),
      makeClip({ clipId: "short", startOffset: 0, track: "V2" }),
    ];
    const result = getActiveClipAtTime(10, clips);
    expect(result!.clip.clipId).toBe("long");
  });

  it("returns null past all content", () => {
    expect(getActiveClipAtTime(20, [makeClip({ startOffset: 0 })])).toBeNull();
  });

  it("returns correct localTime with trimIn", () => {
    const clips = [makeClip({ trimIn: 2, trimOut: 6, startOffset: 0 })];
    const result = getActiveClipAtTime(1, clips);
    expect(result!.localTime).toBe(3); // trimIn(2) + timeInClip(1)
  });
});

describe("getNextClipAfterTime", () => {
  it("returns the next clip when query time lands in a gap", () => {
    const clips = [
      makeClip({ clipId: "c1", startOffset: 0 }),
      makeClip({ clipId: "c2", startOffset: 12 }),
    ];
    const result = getNextClipAfterTime(9, clips);
    expect(result!.clip.clipId).toBe("c2");
    expect(result!.localTime).toBe(0);
  });

  it("returns null when no clips start after the given time", () => {
    expect(getNextClipAfterTime(9, [makeClip({ startOffset: 0 })])).toBeNull();
  });

  it("picks highest priority track when clips start together", () => {
    const clips = [
      makeClip({ clipId: "v1", startOffset: 10, track: "V1" }),
      makeClip({ clipId: "v2", startOffset: 10, track: "V2" }),
    ];
    expect(getNextClipAfterTime(5, clips)!.clip.clipId).toBe("v2");
  });

  it("returns localTime respecting trimIn", () => {
    const clips = [makeClip({ trimIn: 2, trimOut: 6, startOffset: 10 })];
    expect(getNextClipAfterTime(5, clips)!.localTime).toBe(2);
  });
});

describe("resolvePlayheadState", () => {
  const clips = [
    makeClip({ clipId: "c1", startOffset: 0 }), // 0-8
    makeClip({ clipId: "c2", startOffset: 12 }), // 12-20
  ];

  it("returns the clip and local time when inside a clip", () => {
    const state = resolvePlayheadState(2, clips);
    expect(state.kind).toBe("clip");
    if (state.kind === "clip") {
      expect(state.clip.clipId).toBe("c1");
      expect(state.localTime).toBe(2);
    }
  });

  it("returns a gap with the next clip's start when between clips", () => {
    expect(resolvePlayheadState(9, clips)).toEqual({ kind: "gap", nextStart: 12 });
  });

  it("returns a gap before the first clip when the timeline starts late", () => {
    const late = [makeClip({ startOffset: 3 })];
    expect(resolvePlayheadState(0, late)).toEqual({ kind: "gap", nextStart: 3 });
  });

  it("returns end at or past the total duration", () => {
    expect(resolvePlayheadState(20, clips).kind).toBe("end");
    expect(resolvePlayheadState(25, clips).kind).toBe("end");
  });

  it("returns end for an empty timeline", () => {
    expect(resolvePlayheadState(0, []).kind).toBe("end");
  });
});

describe("resolvePlaybackStart", () => {
  it("starts inside the active clip when the playhead is on one", () => {
    const result = resolvePlaybackStart(2, [makeClip({ startOffset: 0 })]);
    expect(result!.timelineTime).toBe(2);
    expect(result!.state.kind).toBe("clip");
  });

  it("stays in the gap instead of jumping when the playhead is between clips", () => {
    const clips = [
      makeClip({ startOffset: 0 }),
      makeClip({ startOffset: 12 }),
    ];
    const result = resolvePlaybackStart(9, clips);
    expect(result!.timelineTime).toBe(9);
    expect(result!.state).toEqual({ kind: "gap", nextStart: 12 });
  });

  it("restarts from timeline zero when the playhead is past the end", () => {
    const clips = [
      makeClip({ startOffset: 2 }),
      makeClip({ startOffset: 10 }),
    ];
    const result = resolvePlaybackStart(18, clips);
    expect(result!.timelineTime).toBe(0);
    expect(result!.state).toEqual({ kind: "gap", nextStart: 2 });
  });

  it("returns null for an empty timeline", () => {
    expect(resolvePlaybackStart(0, [])).toBeNull();
  });
});

describe("getFollowingClip", () => {
  it("returns the contiguous next clip with its starting local time", () => {
    const clips = [
      makeClip({ clipId: "c1", startOffset: 0 }),
      makeClip({ clipId: "c2", trimIn: 2, trimOut: 6, startOffset: 8 }),
    ];

    const result = getFollowingClip(clips[0], clips);

    expect(result!.clip.clipId).toBe("c2");
    expect(result!.localTime).toBeCloseTo(2, 2);
  });

  it("returns the clip after a gap", () => {
    const clips = [
      makeClip({ clipId: "c1", startOffset: 0 }),
      makeClip({ clipId: "c2", startOffset: 15 }),
    ];

    expect(getFollowingClip(clips[0], clips)!.clip.clipId).toBe("c2");
  });

  it("returns null for the last clip", () => {
    const clips = [makeClip({ clipId: "c1", startOffset: 0 })];

    expect(getFollowingClip(clips[0], clips)).toBeNull();
  });

  it("returns the underlying track's clip when a higher-track clip ends over it", () => {
    const clips = [
      makeClip({ clipId: "under", sourceDuration: 16, startOffset: 0, track: "V1" }),
      makeClip({ clipId: "over", startOffset: 0, track: "V2" }),
    ];

    const result = getFollowingClip(clips[1], clips);

    expect(result!.clip.clipId).toBe("under");
    expect(result!.localTime).toBeCloseTo(8, 1);
  });
});

describe("computeClipSplit", () => {
  const clip = makeClip({ clipId: "c1", trimIn: 1, trimOut: 7, startOffset: 2 }); // 2-8 on timeline

  it("splits at the playhead into source-file seconds", () => {
    expect(computeClipSplit(clip, 5)).toEqual({
      clipId: "c1",
      splitLocalTime: 4, // trimIn(1) + offset(3)
      secondStartTime: 5,
    });
  });

  it("returns null when the playhead is outside the clip", () => {
    expect(computeClipSplit(clip, 1)).toBeNull();
    expect(computeClipSplit(clip, 9)).toBeNull();
  });

  it("returns null when a piece would be under the minimum duration", () => {
    expect(computeClipSplit(clip, 2.2)).toBeNull(); // first piece 0.2s
    expect(computeClipSplit(clip, 7.8)).toBeNull(); // second piece 0.2s
  });

  it("allows pieces exactly at the minimum duration", () => {
    expect(computeClipSplit(clip, 2.5)).not.toBeNull();
    expect(computeClipSplit(clip, 7.5)).not.toBeNull();
  });
});

describe("snapStartTime", () => {
  const others = [
    makeClip({ startOffset: 0 }), // occupies 0-8
    makeClip({ startOffset: 20 }), // occupies 20-28
  ];

  it("snaps the start edge to an adjacent clip's end", () => {
    expect(snapStartTime(8.3, 5, others, 0.5)).toBe(8);
  });

  it("snaps the start edge to a clip's start", () => {
    expect(snapStartTime(19.7, 5, others, 0.5)).toBe(20);
  });

  it("snaps the end edge to the next clip's start", () => {
    expect(snapStartTime(15.2, 5, others, 0.5)).toBe(15);
  });

  it("snaps to timeline zero", () => {
    expect(snapStartTime(0.3, 5, others, 0.5)).toBe(0);
  });

  it("does not snap outside the threshold", () => {
    expect(snapStartTime(10, 5, others, 0.5)).toBe(10);
  });

  it("picks the nearest snap point when several are in range", () => {
    expect(snapStartTime(8.1, 5, others, 2)).toBe(8);
  });

  it("returns the proposed time when there is nothing to snap to", () => {
    expect(snapStartTime(3.7, 5, [], 0.5)).toBe(3.7);
  });
});

describe("orderClipsForExport", () => {
  it("orders by timeline position, not track id", () => {
    const clips = [
      makeClip({ clipId: "later", startOffset: 5, track: "V1" }),
      makeClip({ clipId: "earlier", startOffset: 0, track: "V2" }),
    ];
    expect(orderClipsForExport(clips).map((c) => c.clipId)).toEqual(["earlier", "later"]);
  });

  it("puts the higher video track first when clips start together", () => {
    const clips = [
      makeClip({ clipId: "v1", startOffset: 0, track: "V1" }),
      makeClip({ clipId: "v2", startOffset: 0, track: "V2" }),
    ];
    expect(orderClipsForExport(clips).map((c) => c.clipId)).toEqual(["v2", "v1"]);
  });

  it("does not mutate the input array", () => {
    const clips = [
      makeClip({ clipId: "b", startOffset: 5 }),
      makeClip({ clipId: "a", startOffset: 0 }),
    ];
    orderClipsForExport(clips);
    expect(clips[0].clipId).toBe("b");
  });
});

describe("formatTime", () => {
  it("formats 0 seconds", () => {
    expect(formatTime(0)).toBe("00:00.0");
  });

  it("formats 90.5 seconds", () => {
    expect(formatTime(90.5)).toBe("01:30.5");
  });

  it("formats single digit seconds", () => {
    expect(formatTime(5)).toBe("00:05.0");
  });
});
