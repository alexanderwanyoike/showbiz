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

/** The Electron-only export settings form (string inputs; blank = auto/probe). */
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
