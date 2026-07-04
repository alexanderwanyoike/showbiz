import { useEffect, useState } from "react";
import { videoDurationCache } from "../lib/video-duration";

/**
 * Probe the real duration of each video URL. Returns a map of URL to
 * duration in seconds, filled in as probes complete. Probes are cached per
 * URL, so version switches (new URL) re-probe while re-renders do not.
 */
export function useVideoDurations(
  urls: Array<string | null | undefined>
): Record<string, number> {
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    for (const url of urls) {
      if (!url) continue;
      videoDurationCache.get(url).then((duration) => {
        if (cancelled || duration === null) return;
        setDurations((prev) =>
          prev[url] === duration ? prev : { ...prev, [url]: duration }
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [urls]);

  return durations;
}
