import type { TimelineEdit } from "./tauri-api";

export interface Shot {
  id: string;
  storyboard_id: string;
  order: number;
  duration: number;
  image_prompt: string | null;
  image_url: string | null;
  video_prompt: string | null;
  video_url: string | null;
  status: "pending" | "generating" | "complete" | "failed";
}

export interface TimelineClip {
  shot: Shot;
  edit: TimelineEdit | null;
  effectiveDuration: number;
  startOffset: number;
}

/**
 * Build timeline clips from shots and edits
 */
export function buildTimelineClips(
  shots: Shot[],
  edits: TimelineEdit[]
): TimelineClip[] {
  const editMap = new Map(edits.map((e) => [e.shot_id, e]));
  let offset = 0;

  return shots
    .filter((shot) => shot.status === "complete" && shot.video_url)
    .map((shot) => {
      const edit = editMap.get(shot.id) || null;
      const trimIn = edit?.trim_in ?? 0;
      const trimOut = edit?.trim_out ?? shot.duration;
      const effectiveDuration = trimOut - trimIn;

      const clip: TimelineClip = {
        shot,
        edit,
        effectiveDuration,
        startOffset: offset,
      };

      offset += effectiveDuration;
      return clip;
    });
}

/**
 * Get total timeline duration
 */
export function getTotalDuration(clips: TimelineClip[]): number {
  return clips.reduce((sum, clip) => sum + clip.effectiveDuration, 0);
}

/**
 * Convert timeline time to clip-local time
 */
export function timelineToClipTime(
  timelineTime: number,
  clips: TimelineClip[]
): { clipIndex: number; localTime: number } | null {
  let accumulated = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipDuration = clip.effectiveDuration;

    if (timelineTime < accumulated + clipDuration) {
      const trimIn = clip.edit?.trim_in ?? 0;
      const localTime = trimIn + (timelineTime - accumulated);
      return { clipIndex: i, localTime };
    }

    accumulated += clipDuration;
  }

  return null;
}

/**
 * Convert clip-local time to timeline time
 */
export function clipToTimelineTime(
  clipIndex: number,
  localTime: number,
  clips: TimelineClip[]
): number {
  let accumulated = 0;

  for (let i = 0; i < clipIndex; i++) {
    accumulated += clips[i].effectiveDuration;
  }

  const clip = clips[clipIndex];
  const trimIn = clip.edit?.trim_in ?? 0;
  const offsetInClip = localTime - trimIn;

  return accumulated + offsetInClip;
}

/**
 * Format seconds to MM:SS.s display
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}
