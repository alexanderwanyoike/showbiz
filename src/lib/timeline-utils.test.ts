import { describe, it, expect } from "vitest";
import {
  buildTimelineClipsFromExplicit,
  getTotalDuration,
  timelineToClipTime,
  clipToTimelineTime,
  getActiveClipAtTime,
  getNextClipAfterTime,
  resolvePlaybackStart,
  snapStartTime,
  orderClipsForExport,
  trackPriority,
  formatTime,
  type Shot,
  type TimelineClip,
  type TimelineClipEntry,
} from "./timeline-utils";
import type { TimelineEdit } from "./tauri-api";

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

function makeEdit(overrides: Partial<TimelineEdit> = {}): TimelineEdit {
  return {
    id: "edit-1",
    storyboard_id: "sb-1",
    shot_id: "shot-1",
    trim_in: 0,
    trim_out: 8,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  };
}

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  const shot = overrides.shot ?? makeShot();
  const edit = overrides.edit ?? null;
  const sourceDuration = overrides.sourceDuration ?? shot.duration;
  const trimIn = overrides.trimIn ?? edit?.trim_in ?? 0;
  const trimOut = overrides.trimOut ?? edit?.trim_out ?? sourceDuration;
  return {
    shot,
    edit,
    sourceDuration,
    trimIn,
    trimOut,
    effectiveDuration: overrides.effectiveDuration ?? trimOut - trimIn,
    startOffset: overrides.startOffset ?? 0,
    track: overrides.track ?? "V1",
  };
}

describe("getTotalDuration (single track)", () => {
  it("sums clip durations on one track", () => {
    const clips = [
      makeClip({ effectiveDuration: 3, trimOut: 3, startOffset: 0 }),
      makeClip({ effectiveDuration: 5, trimOut: 5, startOffset: 3 }),
    ];
    expect(getTotalDuration(clips)).toBe(8);
  });

  it("returns 0 for empty array", () => {
    expect(getTotalDuration([])).toBe(0);
  });
});

describe("timelineToClipTime", () => {
  const clips = [
    makeClip({
      shot: makeShot({ id: "s1" }),
      edit: makeEdit({ trim_in: 1, trim_out: 4 }),
      startOffset: 0,
    }),
    makeClip({
      shot: makeShot({ id: "s2" }),
      edit: makeEdit({ shot_id: "s2", trim_in: 0, trim_out: 5 }),
      startOffset: 3,
    }),
  ];

  it("maps time to correct clip and local time", () => {
    const result = timelineToClipTime(1.5, clips);
    expect(result).toEqual({ clipIndex: 0, localTime: 2.5 }); // 1 (trimIn) + 1.5
  });

  it("maps time in second clip", () => {
    const result = timelineToClipTime(4, clips);
    expect(result).toEqual({ clipIndex: 1, localTime: 1 }); // 0 (trimIn) + (4 - 3)
  });

  it("returns null past end", () => {
    expect(timelineToClipTime(10, clips)).toBeNull();
  });
});

describe("clipToTimelineTime", () => {
  const clips = [
    makeClip({
      shot: makeShot({ id: "s1" }),
      edit: makeEdit({ trim_in: 2, trim_out: 6 }),
      startOffset: 0,
    }),
    makeClip({ shot: makeShot({ id: "s2" }), startOffset: 4 }),
  ];

  it("reverse maps correctly", () => {
    // localTime=3 in clip 0 → offset in clip = 3 - 2(trimIn) = 1 → timeline = 0 + 1 = 1
    expect(clipToTimelineTime(0, 3, clips)).toBe(1);
  });
});

describe("buildTimelineClipsFromExplicit", () => {
  it("returns empty array when no entries", () => {
    const shots = [makeShot({ id: "s1" })];
    const clips = buildTimelineClipsFromExplicit([], shots, []);
    expect(clips).toHaveLength(0);
  });

  it("builds clips only for explicitly added entries", () => {
    const shots = [
      makeShot({ id: "s1" }),
      makeShot({ id: "s2" }),
      makeShot({ id: "s3" }),
    ];
    const entries: TimelineClipEntry[] = [
      { shotId: "s2", track: "V1", startTime: 0 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips).toHaveLength(1);
    expect(clips[0].shot.id).toBe("s2");
    expect(clips[0].track).toBe("V1");
  });

  it("skips entries for non-existent shots", () => {
    const shots = [makeShot({ id: "s1" })];
    const entries: TimelineClipEntry[] = [
      { shotId: "missing", track: "V1", startTime: 0 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips).toHaveLength(0);
  });

  it("skips non-complete shots", () => {
    const shots = [makeShot({ id: "s1", status: "pending" })];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips).toHaveLength(0);
  });

  it("uses startTime directly as startOffset", () => {
    const shots = [makeShot({ id: "s1" }), makeShot({ id: "s2" })];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
      { shotId: "s2", track: "V1", startTime: 10.5 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips[0].startOffset).toBe(0);
    expect(clips[1].startOffset).toBe(10.5);
  });

  it("handles multiple tracks independently", () => {
    const shots = [makeShot({ id: "s1" }), makeShot({ id: "s2" })];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
      { shotId: "s2", track: "V2", startTime: 5 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips).toHaveLength(2);
    const v1 = clips.find((c) => c.track === "V1");
    const v2 = clips.find((c) => c.track === "V2");
    expect(v1?.shot.id).toBe("s1");
    expect(v2?.shot.id).toBe("s2");
    expect(v1?.startOffset).toBe(0);
    expect(v2?.startOffset).toBe(5);
  });

  it("applies edits to explicit clips", () => {
    const shots = [makeShot({ id: "s1" })];
    const edits = [makeEdit({ shot_id: "s1", trim_in: 1, trim_out: 5 })];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, edits);
    expect(clips[0].effectiveDuration).toBe(4);
    expect(clips[0].trimIn).toBe(1);
    expect(clips[0].trimOut).toBe(5);
  });

  it("exposes resolved trims and source duration when no edit exists", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips[0].trimIn).toBe(0);
    expect(clips[0].trimOut).toBe(8);
    expect(clips[0].sourceDuration).toBe(8);
  });
});

describe("buildTimelineClipsFromExplicit with probed durations", () => {
  const entries: TimelineClipEntry[] = [
    { shotId: "s1", track: "V1", startTime: 0 },
  ];

  it("uses probed duration instead of stale shot.duration for default trim-out", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const clips = buildTimelineClipsFromExplicit(entries, shots, [], { s1: 5.2 });
    expect(clips[0].sourceDuration).toBe(5.2);
    expect(clips[0].trimOut).toBe(5.2);
    expect(clips[0].effectiveDuration).toBe(5.2);
  });

  it("clamps a persisted trim_out beyond the real duration", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const edits = [makeEdit({ shot_id: "s1", trim_in: 1, trim_out: 8 })];
    const clips = buildTimelineClipsFromExplicit(entries, shots, edits, { s1: 5 });
    expect(clips[0].trimOut).toBe(5);
    expect(clips[0].effectiveDuration).toBe(4);
  });

  it("clamps trim_in so the clip never has negative duration", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const edits = [makeEdit({ shot_id: "s1", trim_in: 6, trim_out: 8 })];
    const clips = buildTimelineClipsFromExplicit(entries, shots, edits, { s1: 5 });
    expect(clips[0].trimIn).toBe(5);
    expect(clips[0].trimOut).toBe(5);
    expect(clips[0].effectiveDuration).toBe(0);
  });

  it("falls back to shot.duration when no probed duration exists", () => {
    const shots = [makeShot({ id: "s1", duration: 8 })];
    const clips = buildTimelineClipsFromExplicit(entries, shots, [], {});
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

describe("getTotalDuration (multi-track)", () => {
  it("returns max of per-track durations, not sum", () => {
    // V1: 8s + 8s = 16s, V2: 8s = 8s → total should be 16s
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0, track: "V1" }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 8, track: "V1" }),
      makeClip({ shot: makeShot({ id: "s3" }), startOffset: 0, track: "V2" }),
    ];
    expect(getTotalDuration(clips)).toBe(16);
  });

  it("works with single track", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), effectiveDuration: 5, trimOut: 5, startOffset: 0 }),
      makeClip({ shot: makeShot({ id: "s2" }), effectiveDuration: 3, trimOut: 3, startOffset: 5 }),
    ];
    expect(getTotalDuration(clips)).toBe(8);
  });
});

describe("getActiveClipAtTime", () => {
  it("returns V2 clip when V1 and V2 both cover time", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0, track: "V1" }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 0, track: "V2" }),
    ];
    const result = getActiveClipAtTime(2, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.clip.track).toBe("V2");
  });

  it("returns V1 clip when V2 has ended", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1", duration: 16 }), startOffset: 0, track: "V1" }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 0, track: "V2" }),
    ];
    const result = getActiveClipAtTime(10, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s1");
    expect(result!.clip.track).toBe("V1");
  });

  it("returns null past all content", () => {
    const clips = [makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0 })];
    expect(getActiveClipAtTime(20, clips)).toBeNull();
  });

  it("returns correct localTime with trimIn", () => {
    const clips = [
      makeClip({
        shot: makeShot({ id: "s1" }),
        edit: makeEdit({ trim_in: 2, trim_out: 6 }),
        startOffset: 0,
      }),
    ];
    const result = getActiveClipAtTime(1, clips);
    expect(result).not.toBeNull();
    expect(result!.localTime).toBe(3); // trimIn(2) + timeInClip(1)
  });

  it("handles second clip on same track", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), effectiveDuration: 4, trimOut: 4, startOffset: 0 }),
      makeClip({ shot: makeShot({ id: "s2" }), effectiveDuration: 4, trimOut: 4, startOffset: 4 }),
    ];
    const result = getActiveClipAtTime(5, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.localTime).toBe(1); // 5 - 4(startOffset) + 0(trimIn)
  });
});

describe("getNextClipAfterTime", () => {
  it("returns the next clip when query time lands in a gap", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0 }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 12 }),
    ];
    const result = getNextClipAfterTime(9, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.localTime).toBe(0); // trimIn defaults to 0
  });

  it("returns null when no clips start after the given time", () => {
    const clips = [makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0 })];
    expect(getNextClipAfterTime(9, clips)).toBeNull();
  });

  it("picks highest priority track when multiple clips start at the same time", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), startOffset: 10, track: "V1" }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 10, track: "V2" }),
    ];
    const result = getNextClipAfterTime(5, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.clip.track).toBe("V2");
  });

  it("returns localTime respecting trimIn", () => {
    const clips = [
      makeClip({
        shot: makeShot({ id: "s1" }),
        edit: makeEdit({ trim_in: 2, trim_out: 6 }),
        startOffset: 10,
      }),
    ];
    const result = getNextClipAfterTime(5, clips);
    expect(result).not.toBeNull();
    expect(result!.localTime).toBe(2); // starts at trimIn
  });
});

describe("resolvePlaybackStart", () => {
  it("returns the active clip when the playhead is inside one", () => {
    const clips = [makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0 })];
    const result = resolvePlaybackStart(2, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s1");
    expect(result!.localTime).toBe(2);
    expect(result!.timelineTime).toBe(2);
  });

  it("jumps forward to the next clip when the playhead is in a gap", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0 }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 12 }),
    ];
    const result = resolvePlaybackStart(9, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.timelineTime).toBe(12);
    expect(result!.localTime).toBe(0);
  });

  it("jumps to the first clip when the timeline does not start at zero", () => {
    const clips = [makeClip({ shot: makeShot({ id: "s1" }), startOffset: 3 })];
    const result = resolvePlaybackStart(0, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s1");
    expect(result!.timelineTime).toBe(3);
  });

  it("restarts from the earliest clip when the playhead is past the end", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "s1" }), startOffset: 2 }),
      makeClip({ shot: makeShot({ id: "s2" }), startOffset: 10 }),
    ];
    const result = resolvePlaybackStart(18, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s1");
    expect(result!.timelineTime).toBe(2);
  });

  it("starts at the clip's trimIn when jumping to it", () => {
    const clips = [
      makeClip({
        shot: makeShot({ id: "s1" }),
        edit: makeEdit({ trim_in: 2, trim_out: 6 }),
        startOffset: 5,
      }),
    ];
    const result = resolvePlaybackStart(0, clips);
    expect(result!.localTime).toBe(2);
    expect(result!.timelineTime).toBe(5);
  });

  it("returns null for an empty timeline", () => {
    expect(resolvePlaybackStart(0, [])).toBeNull();
  });
});

describe("snapStartTime", () => {
  const others = [
    makeClip({ shot: makeShot({ id: "s1" }), startOffset: 0 }), // occupies 0-8
    makeClip({ shot: makeShot({ id: "s2" }), startOffset: 20 }), // occupies 20-28
  ];

  it("snaps the start edge to an adjacent clip's end", () => {
    expect(snapStartTime(8.3, 5, others, 0.5)).toBe(8);
  });

  it("snaps the start edge to a clip's start", () => {
    expect(snapStartTime(19.7, 5, others, 0.5)).toBe(20);
  });

  it("snaps the end edge to the next clip's start", () => {
    // moving clip is 5s long; start 15.2 puts its end at 20.2, near s2's start
    expect(snapStartTime(15.2, 5, others, 0.5)).toBe(15);
  });

  it("snaps to timeline zero", () => {
    expect(snapStartTime(0.3, 5, others, 0.5)).toBe(0);
  });

  it("does not snap outside the threshold", () => {
    expect(snapStartTime(10, 5, others, 0.5)).toBe(10);
  });

  it("picks the nearest snap point when several are in range", () => {
    // 8 (end of s1) is 0.1 away; 8.5 would not be a candidate
    expect(snapStartTime(8.1, 5, others, 2)).toBe(8);
  });

  it("returns the proposed time when there is nothing to snap to", () => {
    expect(snapStartTime(3.7, 5, [], 0.5)).toBe(3.7);
  });
});

describe("orderClipsForExport", () => {
  it("orders by timeline position, not track id", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "later" }), startOffset: 5, track: "V1" }),
      makeClip({ shot: makeShot({ id: "earlier" }), startOffset: 0, track: "V2" }),
    ];
    const ordered = orderClipsForExport(clips);
    expect(ordered.map((c) => c.shot.id)).toEqual(["earlier", "later"]);
  });

  it("puts the higher video track first when clips start together", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "v1" }), startOffset: 0, track: "V1" }),
      makeClip({ shot: makeShot({ id: "v2" }), startOffset: 0, track: "V2" }),
    ];
    const ordered = orderClipsForExport(clips);
    expect(ordered.map((c) => c.shot.id)).toEqual(["v2", "v1"]);
  });

  it("does not mutate the input array", () => {
    const clips = [
      makeClip({ shot: makeShot({ id: "b" }), startOffset: 5 }),
      makeClip({ shot: makeShot({ id: "a" }), startOffset: 0 }),
    ];
    orderClipsForExport(clips);
    expect(clips[0].shot.id).toBe("b");
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
