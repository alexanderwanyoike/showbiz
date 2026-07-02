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
  /** Real length of the source video in seconds (probed, or shot.duration fallback) */
  sourceDuration: number;
  /** Resolved trim window in source-file seconds, clamped to [0, sourceDuration] */
  trimIn: number;
  trimOut: number;
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
 * Build timeline clips from explicit entries (user-added clips only).
 * Each entry has a startTime for free-form positioning on the timeline.
 * `durations` maps shot id to the probed real video duration; without it the
 * stale integer shot.duration is used and trims may not match the actual file.
 */
export function buildTimelineClipsFromExplicit(
  entries: TimelineClipEntry[],
  shots: Shot[],
  edits: TimelineEdit[],
  durations: Record<string, number> = {}
): TimelineClip[] {
  const shotMap = new Map(shots.map((s) => [s.id, s]));
  const editMap = new Map(edits.map((e) => [e.shot_id, e]));

  const clips: TimelineClip[] = [];

  for (const entry of entries) {
    const shot = shotMap.get(entry.shotId);
    if (!shot || shot.status !== "complete" || !shot.video_url) continue;

    const edit = editMap.get(shot.id) || null;
    const sourceDuration = durations[shot.id] ?? shot.duration;
    const trimOut = Math.min(edit?.trim_out ?? sourceDuration, sourceDuration);
    const trimIn = Math.min(Math.max(edit?.trim_in ?? 0, 0), trimOut);

    clips.push({
      shot,
      edit,
      sourceDuration,
      trimIn,
      trimOut,
      effectiveDuration: trimOut - trimIn,
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
      const localTime = clip.trimIn + (time - clip.startOffset);
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
  return { clip, localTime: clip.trimIn };
}

export type PlayheadState =
  | { kind: "clip"; clip: TimelineClip; localTime: number }
  | { kind: "gap"; nextStart: number | null }
  | { kind: "end" };

/**
 * Classify a timeline position: on a clip (play its video), in a gap
 * (show black and let time pass), or at/past the end of all content.
 */
export function resolvePlayheadState(
  time: number,
  clips: TimelineClip[]
): PlayheadState {
  const active = getActiveClipAtTime(time, clips);
  if (active) return { kind: "clip", ...active };

  const total = getTotalDuration(clips);
  if (time < total) {
    const next = getNextClipAfterTime(time, clips);
    return { kind: "gap", nextStart: next ? next.clip.startOffset : null };
  }

  return { kind: "end" };
}

export interface PlaybackStart {
  /** Timeline time playback actually starts at (may differ from the playhead) */
  timelineTime: number;
  state: PlayheadState;
}

/**
 * Resolve where playback should start for a given playhead position.
 * Gaps are honored: playback starts where the playhead is, showing black
 * until the next clip. Past the end, restart from timeline zero.
 */
export function resolvePlaybackStart(
  time: number,
  clips: TimelineClip[]
): PlaybackStart | null {
  if (clips.length === 0) return null;

  const startTime = time < getTotalDuration(clips) ? time : 0;
  return { timelineTime: startTime, state: resolvePlayheadState(startTime, clips) };
}

/**
 * Order clips for export: by timeline position, with higher-priority tracks
 * first when clips start at the same time. Export concatenates clips, so
 * without this the output follows DB order (track id, then time) and does
 * not match what the timeline shows.
 */
export function orderClipsForExport(clips: TimelineClip[]): TimelineClip[] {
  return [...clips].sort((a, b) => {
    const timeDiff = a.startOffset - b.startOffset;
    if (timeDiff !== 0) return timeDiff;
    return trackPriority(b.track) - trackPriority(a.track);
  });
}

/**
 * Snap a proposed clip start time to nearby snap points: timeline zero and
 * the start/end edges of other clips (either edge of the moving clip may
 * land on them). Returns the proposed time unchanged when nothing is within
 * the threshold.
 */
export function snapStartTime(
  proposedStart: number,
  clipDuration: number,
  otherClips: TimelineClip[],
  threshold: number
): number {
  const snapPoints = [0];
  for (const clip of otherClips) {
    snapPoints.push(clip.startOffset, clip.startOffset + clip.effectiveDuration);
  }

  let best = proposedStart;
  let bestDistance = threshold;

  for (const point of snapPoints) {
    const startEdgeDistance = Math.abs(proposedStart - point);
    if (startEdgeDistance <= bestDistance) {
      bestDistance = startEdgeDistance;
      best = point;
    }

    const endAlignedStart = point - clipDuration;
    const endEdgeDistance = Math.abs(proposedStart - endAlignedStart);
    if (endAlignedStart >= 0 && endEdgeDistance < bestDistance) {
      bestDistance = endEdgeDistance;
      best = endAlignedStart;
    }
  }

  return best;
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
      const localTime = clip.trimIn + (timelineTime - accumulated);
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
  const offsetInClip = localTime - clip.trimIn;

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
