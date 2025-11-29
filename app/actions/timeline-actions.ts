"use server";

import * as timelineEditsDb from "../lib/data/timeline-edits";

export async function getTimelineEdits(storyboardId: string) {
  return timelineEditsDb.getTimelineEditsByStoryboard(storyboardId);
}

export async function updateTimelineEdit(
  storyboardId: string,
  shotId: string,
  trimIn: number,
  trimOut: number
) {
  // Validate trim values
  if (trimIn < 0 || trimOut > 8 || trimIn >= trimOut) {
    throw new Error("Invalid trim values");
  }

  // Minimum duration of 0.5 seconds
  if (trimOut - trimIn < 0.5) {
    throw new Error("Minimum clip duration is 0.5 seconds");
  }

  return timelineEditsDb.upsertTimelineEdit(storyboardId, shotId, trimIn, trimOut);
}

export async function resetTimelineEdit(shotId: string) {
  return timelineEditsDb.deleteTimelineEdit(shotId);
}

export async function resetAllTimelineEdits(storyboardId: string) {
  return timelineEditsDb.deleteTimelineEditsByStoryboard(storyboardId);
}
