import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  getActiveClipAtTime,
  getNextClipAfterTime,
  clipToTimelineTime,
  getTotalDuration,
} from "../lib/timeline-utils";
import { MpvPlayer } from "./useMpvPlayer";
import { assetUrlToPath } from "../lib/tauri-api";
import { resolveSeekAction } from "../lib/seek-utils";

interface UseTimelinePlaybackOptions {
  clips: TimelineClip[];
  mpv: MpvPlayer;
}

export function useTimelinePlayback({ clips, mpv }: UseTimelinePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const pendingRef = useRef(false);
  const currentFileRef = useRef<string>("");
  // Track which clip is actively loaded so we detect transitions
  const activeClipRef = useRef<{ shotId: string; track: string } | null>(null);

  const totalDuration = getTotalDuration(clips);

  const play = useCallback(async () => {
    if (clips.length === 0 || pendingRef.current) return;
    pendingRef.current = true;

    const active = getActiveClipAtTime(currentTime, clips);
    if (active) {
      const { clip, localTime } = active;
      if (clip.shot.video_url) {
        activeClipRef.current = { shotId: clip.shot.id, track: clip.track };
        const { shouldReload, path } = resolveSeekAction(clip.shot.video_url, currentFileRef.current);
        if (shouldReload) {
          await mpv.loadFile(clip.shot.video_url, localTime);
          currentFileRef.current = path;
        } else if (localTime > 0) {
          await mpv.seek(localTime);
        }
        await mpv.play();
        setIsPlaying(true);
      }
    }
    pendingRef.current = false;
  }, [clips, currentTime, mpv]);

  const pause = useCallback(async () => {
    setIsPlaying(false);
    pendingRef.current = false;
    await mpv.pause();
  }, [mpv]);

  const seek = useCallback(
    async (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clamped);

      const active = getActiveClipAtTime(clamped, clips);
      if (!active) return;
      const { clip, localTime } = active;
      if (!clip.shot.video_url) return;

      activeClipRef.current = { shotId: clip.shot.id, track: clip.track };
      const { shouldReload, path } = resolveSeekAction(clip.shot.video_url, currentFileRef.current);
      if (shouldReload) {
        await mpv.loadFile(clip.shot.video_url, localTime);
        currentFileRef.current = path;
      } else {
        await mpv.seek(localTime);
      }
      await mpv.pause(); // show frame, don't play
    },
    [clips, totalDuration, mpv]
  );

  const skipToStart = useCallback(() => seek(0), [seek]);
  const skipToEnd = useCallback(() => seek(totalDuration), [seek, totalDuration]);
  const skipBackward = useCallback(() => seek(Math.max(0, currentTime - 5)), [seek, currentTime]);
  const skipForward = useCallback(
    () => seek(Math.min(totalDuration, currentTime + 5)),
    [seek, currentTime, totalDuration]
  );

  // Poll mpv position at ~100 ms while playing; handle clip transitions
  useEffect(() => {
    if (!isPlaying || clips.length === 0) return;

    const interval = setInterval(async () => {
      if (pendingRef.current) return;

      const pos = await mpv.getPosition();
      if (pos === null) return;

      const active = activeClipRef.current;
      if (!active) return;

      // Find the currently loaded clip to check trimOut
      const loadedClip = clips.find(
        (c) => c.shot.id === active.shotId && c.track === active.track
      );
      if (!loadedClip) return;

      const trimOut = loadedClip.edit?.trim_out ?? loadedClip.shot.duration;

      if (pos >= trimOut - 0.05) {
        // Current clip ended — advance timeline time and re-resolve
        const nextTime = loadedClip.startOffset + loadedClip.effectiveDuration + 0.01;
        const nextActive = getActiveClipAtTime(nextTime, clips);

        // Try exact time first, then scan forward for the next clip after a gap
        const resolved = nextActive ?? getNextClipAfterTime(nextTime, clips);

        if (resolved && resolved.clip.shot.video_url) {
          pendingRef.current = true;
          const { clip: nextClip, localTime: nextLocalTime } = resolved;
          activeClipRef.current = { shotId: nextClip.shot.id, track: nextClip.track };
          setCurrentTime(nextClip.startOffset);
          await mpv.loadFile(nextClip.shot.video_url, nextLocalTime);
          currentFileRef.current = assetUrlToPath(nextClip.shot.video_url) ?? nextClip.shot.video_url;
          await mpv.play();
          pendingRef.current = false;
        } else {
          // No more clips — stop playback
          setIsPlaying(false);
          await mpv.pause();
          setCurrentTime(totalDuration);
        }
      } else {
        // Still playing current clip — update timeline position
        const trimIn = loadedClip.edit?.trim_in ?? 0;
        const timeInClip = pos - trimIn;
        setCurrentTime(loadedClip.startOffset + timeInClip);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, clips, totalDuration, mpv]);

  return {
    isPlaying,
    currentTime,
    totalDuration,
    play,
    pause,
    seek,
    skipToStart,
    skipToEnd,
    skipBackward,
    skipForward,
  };
}
