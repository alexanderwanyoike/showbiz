import { describe, expect, it } from "vitest";
import {
  getStoryboardModePath,
  normalizeWorkspaceMode,
  type WorkspaceMode,
} from "./workstation-shell";

describe("normalizeWorkspaceMode", () => {
  it("defaults to storyboard when no mode is provided", () => {
    expect(normalizeWorkspaceMode(undefined)).toBe("storyboard");
  });

  it("keeps supported workstation modes", () => {
    const modes: WorkspaceMode[] = ["storyboard", "timeline"];

    for (const mode of modes) {
      expect(normalizeWorkspaceMode(mode)).toBe(mode);
    }
  });

  it("maps the legacy editor mode to timeline", () => {
    expect(normalizeWorkspaceMode("editor")).toBe("timeline");
  });

  it("falls back to storyboard for unknown modes", () => {
    expect(normalizeWorkspaceMode("unknown")).toBe("storyboard");
  });
});

describe("getStoryboardModePath", () => {
  it("builds the storyboard mode path", () => {
    expect(getStoryboardModePath("story-123", "storyboard")).toBe(
      "/storyboard/story-123/storyboard"
    );
  });

  it("builds the timeline mode path", () => {
    expect(getStoryboardModePath("story-123", "timeline")).toBe(
      "/storyboard/story-123/timeline"
    );
  });
});
