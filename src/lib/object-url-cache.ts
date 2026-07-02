/**
 * Cache of source video URLs to blob object URLs.
 *
 * On Linux, WebKitGTK hands <video> sources to GStreamer, which cannot read
 * Tauri's asset:// scheme, so every clip must be fetched through the asset
 * protocol and played from a blob object URL (see docs/html5-video-migration.md).
 * Clips are small (a few MB) and reused constantly while editing, so they are
 * cached for the editor's lifetime and revoked together on unmount.
 */
export function createObjectUrlCache(
  fetcher: (url: string) => Promise<Blob>,
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url)
) {
  const cache = new Map<string, Promise<string>>();

  return {
    get(sourceUrl: string): Promise<string> {
      const cached = cache.get(sourceUrl);
      if (cached) return cached;

      const entry = fetcher(sourceUrl).then(createUrl);
      // Failed fetches are evicted so the next request retries
      entry.catch(() => cache.delete(sourceUrl));
      cache.set(sourceUrl, entry);
      return entry;
    },

    async revokeAll(): Promise<void> {
      const entries = [...cache.values()];
      cache.clear();
      await Promise.all(entries.map((entry) => entry.then(revokeUrl).catch(() => {})));
    },
  };
}

export type ObjectUrlCache = ReturnType<typeof createObjectUrlCache>;

/** Default fetcher: read a video through the asset protocol as a Blob. */
export async function fetchVideoBlob(url: string): Promise<Blob> {
  const response = await window.fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch video (${response.status}): ${url}`);
  }
  return response.blob();
}
