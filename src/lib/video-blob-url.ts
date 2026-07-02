/**
 * WebKitGTK's GStreamer media backend does not understand Tauri's asset://
 * scheme, so <video> elements must be fed blob URLs instead. This mirrors the
 * fetch-to-blob path thumbnail-generator.ts already uses to load frames.
 */
export async function createVideoBlobUrl(assetUrl: string): Promise<string> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch video (${response.status}): ${assetUrl}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function revokeVideoBlobUrl(blobUrl: string | null): void {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
  }
}
