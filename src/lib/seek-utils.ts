import { assetUrlToPath } from "./tauri-api";

/**
 * Decide whether a seek requires reloading the file or just calling mpv_seek.
 * Returns the resolved filesystem path and whether a reload is needed.
 */
export function resolveSeekAction(
  videoUrl: string,
  currentFilePath: string
): { shouldReload: boolean; path: string } {
  const path = assetUrlToPath(videoUrl) ?? videoUrl;
  return { shouldReload: path !== currentFilePath, path };
}
