import { describe, it, expect } from "vitest";
import {
  buildTimelineClips,
  buildTimelineClipsFromExplicit,
  getTotalDuration,
  timelineToClipTime,
  clipToTimelineTime,
  getActiveClipAtTime,
  getNextClipAfterTime,
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

describe("buildTimelineClips", () => {
  it("filters out non-complete shots", () => {
    const shots = [
      makeShot({ id: "s1", status: "complete" }),
      makeShot({ id: "s2", status: "pending" }),
      makeShot({ id: "s3", status: "generating" }),
    ];
    const clips = buildTimelineClips(shots, []);
    expect(clips).toHaveLength(1);
    expect(clips[0].shot.id).toBe("s1");
  });

  it("filters out shots without video_url", () => {
    const shots = [
      makeShot({ id: "s1", video_url: null, status: "complete" }),
      makeShot({ id: "s2", video_url: "asset://v.mp4", status: "complete" }),
    ];
    const clips = buildTimelineClips(shots, []);
    expect(clips).toHaveLength(1);
    expect(clips[0].shot.id).toBe("s2");
  });

  it("calculates effective durations from edits", () => {
    const shots = [makeShot({ id: "s1" })];
    const edits = [makeEdit({ shot_id: "s1", trim_in: 1, trim_out: 5 })];
    const clips = buildTimelineClips(shots, edits);
    expect(clips[0].effectiveDuration).toBe(4);
  });

  it("uses shot.duration as default when no edit", () => {
    const clips = buildTimelineClips([makeShot()], []);
    expect(clips[0].effectiveDuration).toBe(8);
  });

  it("accumulates offsets correctly", () => {
    const shots = [
      makeShot({ id: "s1", order: 1 }),
      makeShot({ id: "s2", order: 2 }),
      makeShot({ id: "s3", order: 3 }),
    ];
    const edits = [
      makeEdit({ shot_id: "s1", trim_in: 0, trim_out: 3 }),
      makeEdit({ shot_id: "s2", trim_in: 0, trim_out: 5 }),
    ];
    const clips = buildTimelineClips(shots, edits);
    expect(clips[0].startOffset).toBe(0);
    expect(clips[1].startOffset).toBe(3);
    expect(clips[2].startOffset).toBe(8); // 3 + 5
  });
});

describe("getTotalDuration (single track)", () => {
  it("sums clip durations on one track", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot(), edit: null, effectiveDuration: 3, startOffset: 0, track: "V1" },
      { shot: makeShot(), edit: null, effectiveDuration: 5, startOffset: 3, track: "V1" },
    ];
    expect(getTotalDuration(clips)).toBe(8);
  });

  it("returns 0 for empty array", () => {
    expect(getTotalDuration([])).toBe(0);
  });
});

describe("timelineToClipTime", () => {
  const clips: TimelineClip[] = [
    {
      shot: makeShot({ id: "s1" }),
      edit: makeEdit({ trim_in: 1, trim_out: 4 }),
      effectiveDuration: 3,
      startOffset: 0,
      track: "V1",
    },
    {
      shot: makeShot({ id: "s2" }),
      edit: makeEdit({ shot_id: "s2", trim_in: 0, trim_out: 5 }),
      effectiveDuration: 5,
      startOffset: 3,
      track: "V1",
    },
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
  const clips: TimelineClip[] = [
    {
      shot: makeShot({ id: "s1" }),
      edit: makeEdit({ trim_in: 2, trim_out: 6 }),
      effectiveDuration: 4,
      startOffset: 0,
      track: "V1",
    },
    {
      shot: makeShot({ id: "s2" }),
      edit: null,
      effectiveDuration: 8,
      startOffset: 4,
      track: "V1",
    },
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
    const shots = [
      makeShot({ id: "s1" }),
      makeShot({ id: "s2" }),
    ];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
      { shotId: "s2", track: "V1", startTime: 10.5 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips[0].shot.id).toBe("s1");
    expect(clips[1].shot.id).toBe("s2");
    expect(clips[0].startOffset).toBe(0);
    expect(clips[1].startOffset).toBe(10.5);
  });

  it("allows gaps between clips", () => {
    const shots = [
      makeShot({ id: "s1" }),
      makeShot({ id: "s2" }),
    ];
    const entries: TimelineClipEntry[] = [
      { shotId: "s1", track: "V1", startTime: 0 },
      { shotId: "s2", track: "V1", startTime: 20 },
    ];
    const clips = buildTimelineClipsFromExplicit(entries, shots, []);
    expect(clips[0].startOffset).toBe(0);
    expect(clips[1].startOffset).toBe(20);
    // Gap from 8-20 should not affect total duration
  });

  it("handles multiple tracks independently", () => {
    const shots = [
      makeShot({ id: "s1" }),
      makeShot({ id: "s2" }),
    ];
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
    expect(clips[0].edit?.trim_in).toBe(1);
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
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 8, startOffset: 8, track: "V1" },
      { shot: makeShot({ id: "s3" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V2" },
    ];
    expect(getTotalDuration(clips)).toBe(16);
  });

  it("returns 0 for empty array", () => {
    expect(getTotalDuration([])).toBe(0);
  });

  it("works with single track", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 5, startOffset: 0, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 3, startOffset: 5, track: "V1" },
    ];
    expect(getTotalDuration(clips)).toBe(8);
  });
});

describe("getActiveClipAtTime", () => {
  it("returns V2 clip when V1 and V2 both cover time", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V2" },
    ];
    const result = getActiveClipAtTime(2, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.clip.track).toBe("V2");
  });

  it("returns V1 clip when V2 has ended", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1", duration: 16 }), edit: null, effectiveDuration: 16, startOffset: 0, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V2" },
    ];
    const result = getActiveClipAtTime(10, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s1");
    expect(result!.clip.track).toBe("V1");
  });

  it("returns null past all content", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V1" },
    ];
    expect(getActiveClipAtTime(20, clips)).toBeNull();
  });

  it("returns correct localTime with trimIn", () => {
    const clips: TimelineClip[] = [
      {
        shot: makeShot({ id: "s1" }),
        edit: makeEdit({ trim_in: 2, trim_out: 6 }),
        effectiveDuration: 4,
        startOffset: 0,
        track: "V1",
      },
    ];
    const result = getActiveClipAtTime(1, clips);
    expect(result).not.toBeNull();
    expect(result!.localTime).toBe(3); // trimIn(2) + timeInClip(1)
  });

  it("handles second clip on same track", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 4, startOffset: 0, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 4, startOffset: 4, track: "V1" },
    ];
    const result = getActiveClipAtTime(5, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.localTime).toBe(1); // 5 - 4(startOffset) + 0(trimIn)
  });
});

describe("getNextClipAfterTime", () => {
  it("returns the next clip when query time lands in a gap", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 8, startOffset: 12, track: "V1" },
    ];
    const result = getNextClipAfterTime(9, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.localTime).toBe(0); // trimIn defaults to 0
  });

  it("returns null when no clips start after the given time", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 8, startOffset: 0, track: "V1" },
    ];
    expect(getNextClipAfterTime(9, clips)).toBeNull();
  });

  it("picks highest priority track when multiple clips start at the same time", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot({ id: "s1" }), edit: null, effectiveDuration: 8, startOffset: 10, track: "V1" },
      { shot: makeShot({ id: "s2" }), edit: null, effectiveDuration: 8, startOffset: 10, track: "V2" },
    ];
    const result = getNextClipAfterTime(5, clips);
    expect(result).not.toBeNull();
    expect(result!.clip.shot.id).toBe("s2");
    expect(result!.clip.track).toBe("V2");
  });

  it("returns localTime respecting trimIn", () => {
    const clips: TimelineClip[] = [
      {
        shot: makeShot({ id: "s1" }),
        edit: makeEdit({ trim_in: 2, trim_out: 6 }),
        effectiveDuration: 4,
        startOffset: 10,
        track: "V1",
      },
    ];
    const result = getNextClipAfterTime(5, clips);
    expect(result).not.toBeNull();
    expect(result!.localTime).toBe(2); // starts at trimIn
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
