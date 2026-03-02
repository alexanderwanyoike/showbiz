import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  timelineToClipTime,
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
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const pendingRef = useRef(false);
  const currentFileRef = useRef<string>("");

  const totalDuration = getTotalDuration(clips);

  const play = useCallback(async () => {
    if (clips.length === 0 || pendingRef.current) return;
    pendingRef.current = true;

    const mapping = timelineToClipTime(currentTime, clips);
    if (mapping) {
      const clip = clips[mapping.clipIndex];
      if (clip?.shot.video_url) {
        setCurrentClipIndex(mapping.clipIndex);
        const { shouldReload, path } = resolveSeekAction(clip.shot.video_url, currentFileRef.current);
        if (shouldReload) {
          await mpv.loadFile(clip.shot.video_url, mapping.localTime);
          currentFileRef.current = path;
        } else if (mapping.localTime > 0) {
          await mpv.seek(mapping.localTime);
        }
        await mpv.play(); // explicit resume
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

      const mapping = timelineToClipTime(clamped, clips);
      if (!mapping) return;
      setCurrentClipIndex(mapping.clipIndex);
      const clip = clips[mapping.clipIndex];
      if (!clip?.shot.video_url) return;
      const { shouldReload, path } = resolveSeekAction(clip.shot.video_url, currentFileRef.current);
      if (shouldReload) {
        await mpv.loadFile(clip.shot.video_url, mapping.localTime);
        currentFileRef.current = path;
      } else {
        await mpv.seek(mapping.localTime);
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

      const clip = clips[currentClipIndex];
      if (!clip) return;

      const trimOut = clip.edit?.trim_out ?? 8;

      if (pos >= trimOut - 0.05) {
        const nextIndex = currentClipIndex + 1;
        if (nextIndex < clips.length) {
          const nextClip = clips[nextIndex];
          if (nextClip?.shot.video_url) {
            pendingRef.current = true;
            setCurrentClipIndex(nextIndex);
            const trimIn = nextClip.edit?.trim_in ?? 0;
            setCurrentTime(clipToTimelineTime(nextIndex, trimIn, clips));
            await mpv.loadFile(nextClip.shot.video_url, trimIn);
            currentFileRef.current = assetUrlToPath(nextClip.shot.video_url) ?? nextClip.shot.video_url;
            await mpv.play();
            pendingRef.current = false;
          }
        } else {
          setIsPlaying(false);
          await mpv.pause();
          setCurrentTime(totalDuration);
        }
      } else {
        setCurrentTime(clipToTimelineTime(currentClipIndex, pos, clips));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, clips, currentClipIndex, totalDuration, mpv]);

  return {
    isPlaying,
    currentTime,
    totalDuration,
    currentClipIndex,
    play,
    pause,
    seek,
    skipToStart,
    skipToEnd,
    skipBackward,
    skipForward,
  };
}
