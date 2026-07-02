import { useEffect, useState } from "react";
import { videoDurationCache } from "../lib/video-duration";

interface ShotLike {
  id: string;
  video_url: string | null;
}

/**
 * Probe the real duration of each shot's current video file.
 * Returns a map of shot id to duration in seconds, filled in as probes
 * complete. Probes are cached per URL, so version switches (new URL)
 * re-probe while re-renders do not.
 */
export function useVideoDurations(shots: ShotLike[]): Record<string, number> {
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    for (const shot of shots) {
      if (!shot.video_url) continue;
      videoDurationCache.get(shot.video_url).then((duration) => {
        if (cancelled || duration === null) return;
        setDurations((prev) =>
          prev[shot.id] === duration ? prev : { ...prev, [shot.id]: duration }
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [shots]);

  return durations;
}
