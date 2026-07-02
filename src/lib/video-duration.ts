import { thumbnailGenerator } from "./thumbnail-generator";

export type DurationProber = (videoUrl: string) => Promise<number>;

/**
 * Cache of real video durations keyed by URL. The DB's shot.duration is an
 * integer that is never updated after generation, so playback and trimming
 * must probe the actual file. Failed or non-positive probes are not cached,
 * so they are retried on the next request.
 */
export function createVideoDurationCache(prober: DurationProber) {
  const cache = new Map<string, Promise<number | null>>();

  return {
    get(videoUrl: string): Promise<number | null> {
      const cached = cache.get(videoUrl);
      if (cached) return cached;

      const probe = prober(videoUrl).then(
        (duration) => {
          if (!Number.isFinite(duration) || duration <= 0) {
            cache.delete(videoUrl);
            return null;
          }
          return duration;
        },
        () => {
          cache.delete(videoUrl);
          return null;
        }
      );

      cache.set(videoUrl, probe);
      return probe;
    },
  };
}

export const videoDurationCache = createVideoDurationCache((url) =>
  thumbnailGenerator.getVideoDuration(url)
);
