import { describe, expect, it } from "vitest";
import type { TimelineClip } from "./timeline-utils";
import {
  getSelectedClipId,
  getSelectedClipSummary,
} from "./timeline-workspace";

const clips: TimelineClip[] = [
  {
    shot: {
      id: "shot-1",
      storyboard_id: "sb-1",
      order: 1,
      duration: 8,
      image_prompt: "opening",
      image_url: null,
      video_prompt: "opening motion",
      video_url: "video-1",
      status: "complete",
    },
    edit: null,
    effectiveDuration: 8,
    startOffset: 0,
  },
  {
    shot: {
      id: "shot-2",
      storyboard_id: "sb-1",
      order: 2,
      duration: 6,
      image_prompt: "cutaway",
      image_url: null,
      video_prompt: "cutaway motion",
      video_url: "video-2",
      status: "complete",
    },
    edit: {
      id: "edit-2",
      storyboard_id: "sb-1",
      shot_id: "shot-2",
      trim_in: 1,
      trim_out: 5,
      created_at: "",
      updated_at: "",
    },
    effectiveDuration: 4,
    startOffset: 8,
  },
];

describe("getSelectedClipId", () => {
  it("keeps the selected clip when it exists", () => {
    expect(getSelectedClipId(clips, "shot-2")).toBe("shot-2");
  });

  it("falls back to the first clip when selection is missing", () => {
    expect(getSelectedClipId(clips, null)).toBe("shot-1");
  });

  it("returns null when there are no clips", () => {
    expect(getSelectedClipId([], null)).toBeNull();
  });
});

describe("getSelectedClipSummary", () => {
  it("returns clip details for the inspector", () => {
    expect(getSelectedClipSummary(clips[1])).toEqual({
      shotNumber: 2,
      sourceDuration: 6,
      effectiveDuration: 4,
      trimIn: 1,
      trimOut: 5,
    });
  });
});
