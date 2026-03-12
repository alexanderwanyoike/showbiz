import { describe, it, expect } from "vitest";
import {
  buildTimelineClips,
  getTotalDuration,
  timelineToClipTime,
  clipToTimelineTime,
  formatTime,
  type Shot,
  type TimelineClip,
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

describe("getTotalDuration", () => {
  it("sums clip durations", () => {
    const clips: TimelineClip[] = [
      { shot: makeShot(), edit: null, effectiveDuration: 3, startOffset: 0 },
      { shot: makeShot(), edit: null, effectiveDuration: 5, startOffset: 3 },
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
    },
    {
      shot: makeShot({ id: "s2" }),
      edit: makeEdit({ shot_id: "s2", trim_in: 0, trim_out: 5 }),
      effectiveDuration: 5,
      startOffset: 3,
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
    },
    {
      shot: makeShot({ id: "s2" }),
      edit: null,
      effectiveDuration: 8,
      startOffset: 4,
    },
  ];

  it("reverse maps correctly", () => {
    // localTime=3 in clip 0 → offset in clip = 3 - 2(trimIn) = 1 → timeline = 0 + 1 = 1
    expect(clipToTimelineTime(0, 3, clips)).toBe(1);
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
