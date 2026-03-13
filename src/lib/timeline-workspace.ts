import type { TimelineClip } from "./timeline-utils";

export function getSelectedClipId(
  clips: TimelineClip[],
  selectedClipId: string | null
): string | null {
  if (clips.length === 0) {
    return null;
  }

  if (selectedClipId && clips.some((clip) => clip.shot.id === selectedClipId)) {
    return selectedClipId;
  }

  return clips[0].shot.id;
}

export function getSelectedClipSummary(clip: TimelineClip) {
  return {
    shotNumber: clip.shot.order,
    sourceDuration: clip.shot.duration,
    effectiveDuration: clip.effectiveDuration,
    trimIn: clip.edit?.trim_in ?? 0,
    trimOut: clip.edit?.trim_out ?? clip.shot.duration,
  };
}
