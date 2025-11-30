/**
 * Get the URL to serve a media file via the API
 * Includes a cache-busting timestamp to ensure fresh images after regeneration
 *
 * This file is client-safe (no fs/path imports)
 */
export function getMediaUrl(relativePath: string): string {
  return `/api/media/${relativePath}?t=${Date.now()}`;
}
