import { orderClipsForExport, type TimelineClip } from "./timeline-utils";

/**
 * Payload for the Electron native exporter. The renderer never resolves file
 * paths (its clip URLs are blob: under Electron); it sends clip identity + trim
 * + position, and the main process looks up the source file from the DB.
 */
export interface ExportClipPayload {
  shotId: string;
  videoVersionId: string | null;
  track: string;
  trimIn: number;
  trimOut: number;
  startOffset: number;
}

/**
 * Build the export clip payload from timeline clips: ordered like the timeline
 * (orderClipsForExport) and limited to clips that actually have a source video.
 */
export function buildExportClips(clips: TimelineClip[]): ExportClipPayload[] {
  return orderClipsForExport(clips)
    .filter((clip) => clip.videoUrl)
    .map((clip) => ({
      shotId: clip.shot.id,
      videoVersionId: clip.videoVersionId,
      track: clip.track,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      startOffset: clip.startOffset,
    }));
}

/**
 * Build the export payload for the storyboard-mode "assemble movie" flow:
 * every completed shot's current video, back to back on one track, no gaps.
 * Shots without a video or a probeable duration are skipped so the ones
 * after them close ranks instead of leaving black gaps.
 */
export function buildShotConcatClips(
  shots: Array<{ id: string; video_url: string | null }>,
  durations: Record<string, number | null>
): ExportClipPayload[] {
  const clips: ExportClipPayload[] = [];
  let cursor = 0;
  for (const shot of shots) {
    const duration = shot.video_url ? durations[shot.video_url] : null;
    if (!duration || duration <= 0) continue;
    clips.push({
      shotId: shot.id,
      videoVersionId: null,
      track: "V1",
      trimIn: 0,
      trimOut: duration,
      startOffset: cursor,
    });
    cursor += duration;
  }
  return clips;
}

/** The export settings form (string inputs; blank = auto/probe). */
export interface ExportSettingsForm {
  width: string;
  height: string;
  fps: string;
  preset: string;
}

export interface ExportSettingsPayload {
  width?: number;
  height?: number;
  fps?: number;
  preset: string;
}

/**
 * Parse the export settings form into the command payload. Blank or invalid
 * numeric fields become undefined so the main process probes the first clip;
 * preset falls back to "medium".
 */
export function parseExportSettings(form: ExportSettingsForm): ExportSettingsPayload {
  const positiveNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  return {
    width: positiveNumber(form.width),
    height: positiveNumber(form.height),
    fps: positiveNumber(form.fps),
    preset: form.preset.trim() || "medium",
  };
}
