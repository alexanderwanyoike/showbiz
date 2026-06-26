import type { TimelineEdit, TimelineTrack } from "./tauri-api";

/** Track definition for UI rendering, re-exported from tauri-api */
export type Track = TimelineTrack;

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
  track: string;
}

/** An explicit entry saying "this shot starts at this time on this track" */
export interface TimelineClipEntry {
  shotId: string;
  track: string;
  startTime: number;
}

/**
 * Build timeline clips from shots and edits (auto-populates from all complete shots).
 * @deprecated Use buildTimelineClipsFromExplicit for user-controlled timelines.
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
        track: "V1",
      };

      offset += effectiveDuration;
      return clip;
    });
}

/**
 * Build timeline clips from explicit entries (user-added clips only).
 * Each entry has a startTime for free-form positioning on the timeline.
 */
export function buildTimelineClipsFromExplicit(
  entries: TimelineClipEntry[],
  shots: Shot[],
  edits: TimelineEdit[]
): TimelineClip[] {
  const shotMap = new Map(shots.map((s) => [s.id, s]));
  const editMap = new Map(edits.map((e) => [e.shot_id, e]));

  const clips: TimelineClip[] = [];

  for (const entry of entries) {
    const shot = shotMap.get(entry.shotId);
    if (!shot || shot.status !== "complete" || !shot.video_url) continue;

    const edit = editMap.get(shot.id) || null;
    const trimIn = edit?.trim_in ?? 0;
    const trimOut = edit?.trim_out ?? shot.duration;
    const effectiveDuration = trimOut - trimIn;

    clips.push({
      shot,
      edit,
      effectiveDuration,
      startOffset: entry.startTime,
      track: entry.track,
    });
  }

  return clips;
}

/**
 * Extract numeric priority from a track ID.
 * Video tracks (V1, V2, ...) have higher priority than audio (A1, A2, ...).
 * Higher track numbers win within the same type.
 */
export function trackPriority(trackId: string): number {
  const isVideo = trackId.startsWith("V");
  const num = parseInt(trackId.slice(1), 10) || 0;
  // Video base = 1000, audio base = 0
  return (isVideo ? 1000 : 0) + num;
}

/**
 * Get total timeline duration.
 * With multi-track, returns the max track end time (not the sum of all clips).
 */
export function getTotalDuration(clips: TimelineClip[]): number {
  if (clips.length === 0) return 0;

  // Group by track, find end time of last clip on each track
  const trackEnds = new Map<string, number>();
  for (const clip of clips) {
    const end = clip.startOffset + clip.effectiveDuration;
    const current = trackEnds.get(clip.track) ?? 0;
    if (end > current) {
      trackEnds.set(clip.track, end);
    }
  }

  return Math.max(...trackEnds.values());
}

/**
 * Get the active clip at a given timeline time, respecting track priority.
 * Higher video tracks (V2 > V1) take priority when multiple clips cover the same time.
 */
export function getActiveClipAtTime(
  time: number,
  clips: TimelineClip[]
): { clip: TimelineClip; localTime: number } | null {
  // Find all clips that cover this time
  const candidates: { clip: TimelineClip; localTime: number }[] = [];

  for (const clip of clips) {
    const clipEnd = clip.startOffset + clip.effectiveDuration;
    if (time >= clip.startOffset && time < clipEnd) {
      const trimIn = clip.edit?.trim_in ?? 0;
      const localTime = trimIn + (time - clip.startOffset);
      candidates.push({ clip, localTime });
    }
  }

  if (candidates.length === 0) return null;

  // Pick highest priority track
  candidates.sort((a, b) => trackPriority(b.clip.track) - trackPriority(a.clip.track));
  return candidates[0];
}

/**
 * Find the next clip that starts at or after a given time.
 * Useful when playback lands in a gap between clips with free-form positioning.
 * If multiple clips start at the same time, the highest-priority track wins.
 */
export function getNextClipAfterTime(
  time: number,
  clips: TimelineClip[]
): { clip: TimelineClip; localTime: number } | null {
  const candidates = clips.filter((c) => c.startOffset >= time);
  if (candidates.length === 0) return null;

  // Sort by startOffset ascending, then by track priority descending
  candidates.sort((a, b) => {
    const timeDiff = a.startOffset - b.startOffset;
    if (timeDiff !== 0) return timeDiff;
    return trackPriority(b.track) - trackPriority(a.track);
  });

  const clip = candidates[0];
  const trimIn = clip.edit?.trim_in ?? 0;
  return { clip, localTime: trimIn };
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
