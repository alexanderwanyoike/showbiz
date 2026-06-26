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

export function resolvePreviewStill(
  imageUrl: string | null | undefined,
  posterUrl: string | null | undefined
): string | null {
  return imageUrl || posterUrl || null;
}
