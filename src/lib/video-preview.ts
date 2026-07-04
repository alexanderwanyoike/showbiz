export function formatPlaybackTime(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds ?? NaN) || seconds == null || seconds < 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function clampPlaybackTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, seconds);
  return Math.max(0, Math.min(duration, seconds));
}

export type TransportStatus = "stopped" | "playing" | "paused";

/** End detection tolerant of the 250ms position polling granularity */
export function hasReachedEnd(position: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return position >= duration - 0.05;
}

/**
 * Map a play/pause toggle to the player action it requires:
 * stopped → start playback; playing → pause; paused → resume,
 * or restart from the beginning when paused on the final frame.
 */
export function resolveToggleAction(
  status: TransportStatus,
  playback?: { position: number; duration: number }
): "start" | "pause" | "resume" | "restart" {
  if (status === "stopped") return "start";
  if (status === "playing") return "pause";
  if (playback && hasReachedEnd(playback.position, playback.duration)) return "restart";
  return "resume";
}

export function resolvePreviewStill(
  imageUrl: string | null | undefined,
  posterUrl: string | null | undefined
): string | null {
  return imageUrl || posterUrl || null;
}

/**
 * Label for a model duration option. Configs mix bare seconds ("8") and
 * suffixed values ("8s", Veo 3.1) — never double the suffix.
 */
export function formatDurationLabel(duration: string): string {
  if (duration === "auto") return "Auto";
  return duration.endsWith("s") ? duration : `${duration}s`;
}
