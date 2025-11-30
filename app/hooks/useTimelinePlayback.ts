import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  timelineToClipTime,
  clipToTimelineTime,
  getTotalDuration,
} from "../lib/timeline-utils";
import { VideoPool } from "./useVideoPool";

interface UseTimelinePlaybackOptions {
  clips: TimelineClip[];
  videoPool: VideoPool;
}

export function useTimelinePlayback({
  clips,
  videoPool,
}: UseTimelinePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const pendingPlayRef = useRef<boolean>(false);

  const totalDuration = getTotalDuration(clips);

  // Preload next clip when current clip changes
  useEffect(() => {
    if (clips.length > 0 && currentClipIndex < clips.length - 1) {
      videoPool.preloadClip(currentClipIndex + 1);
    }
  }, [currentClipIndex, clips.length, videoPool]);

  const play = useCallback(async () => {
    if (clips.length === 0) return;

    // Prevent multiple concurrent play attempts
    if (pendingPlayRef.current) return;
    pendingPlayRef.current = true;

    setIsPlaying(true);

    const mapping = timelineToClipTime(currentTime, clips);
    if (mapping) {
      setCurrentClipIndex(mapping.clipIndex);

      // Switch to the clip (instant if preloaded)
      const video = await videoPool.switchToClip(
        mapping.clipIndex,
        mapping.localTime
      );

      if (video) {
        try {
          await video.play();
        } catch (err) {
          if (err instanceof Error && err.name !== "AbortError") {
            console.error("Video play error:", err);
          }
        }
      }
    }

    pendingPlayRef.current = false;
  }, [clips, currentTime, videoPool]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    pendingPlayRef.current = false;
    videoPool.getActiveVideo()?.pause();
  }, [videoPool]);

  const seek = useCallback(
    async (time: number) => {
      const clampedTime = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clampedTime);

      const mapping = timelineToClipTime(clampedTime, clips);
      if (mapping) {
        setCurrentClipIndex(mapping.clipIndex);

        // Switch to the clip at the seek position
        await videoPool.switchToClip(mapping.clipIndex, mapping.localTime);
      }
    },
    [clips, totalDuration, videoPool]
  );

  const skipToStart = useCallback(() => {
    seek(0);
  }, [seek]);

  const skipToEnd = useCallback(() => {
    seek(totalDuration);
  }, [seek, totalDuration]);

  const skipBackward = useCallback(() => {
    seek(Math.max(0, currentTime - 5));
  }, [seek, currentTime]);

  const skipForward = useCallback(() => {
    seek(Math.min(totalDuration, currentTime + 5));
  }, [seek, currentTime, totalDuration]);

  // Update timeline time from video timeupdate events
  useEffect(() => {
    const video = videoPool.getActiveVideo();
    if (!video) return;

    const handleTimeUpdate = async () => {
      if (!isPlaying || clips.length === 0 || pendingPlayRef.current) return;

      const clip = clips[currentClipIndex];
      if (!clip) return;

      const trimOut = clip.edit?.trim_out ?? 8;

      // Check if we've reached the end of the current clip's trim
      if (video.currentTime >= trimOut - 0.05) {
        // Move to next clip
        const nextIndex = currentClipIndex + 1;
        if (nextIndex < clips.length) {
          const nextClip = clips[nextIndex];
          if (nextClip.shot.video_url) {
            pendingPlayRef.current = true;
            setCurrentClipIndex(nextIndex);

            const newTime = clipToTimelineTime(
              nextIndex,
              nextClip.edit?.trim_in ?? 0,
              clips
            );
            setCurrentTime(newTime);

            // Switch to preloaded clip (instant)
            const nextVideo = await videoPool.switchToClip(
              nextIndex,
              nextClip.edit?.trim_in ?? 0
            );

            if (nextVideo) {
              try {
                await nextVideo.play();
              } catch (err) {
                if (err instanceof Error && err.name !== "AbortError") {
                  console.error("Video play error:", err);
                }
              }
            }

            pendingPlayRef.current = false;
          }
        } else {
          // End of timeline
          pause();
          setCurrentTime(totalDuration);
        }
      } else {
        // Update current timeline time
        const newTime = clipToTimelineTime(
          currentClipIndex,
          video.currentTime,
          clips
        );
        setCurrentTime(newTime);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [
    isPlaying,
    clips,
    currentClipIndex,
    pause,
    totalDuration,
    videoPool,
  ]);

  // Handle video ended event
  useEffect(() => {
    const video = videoPool.getActiveVideo();
    if (!video) return;

    const handleEnded = async () => {
      if (!isPlaying || pendingPlayRef.current) return;

      const nextIndex = currentClipIndex + 1;
      if (nextIndex < clips.length) {
        const nextClip = clips[nextIndex];
        if (nextClip.shot.video_url) {
          pendingPlayRef.current = true;
          setCurrentClipIndex(nextIndex);

          const nextVideo = await videoPool.switchToClip(
            nextIndex,
            nextClip.edit?.trim_in ?? 0
          );

          if (nextVideo) {
            try {
              await nextVideo.play();
            } catch (err) {
              if (err instanceof Error && err.name !== "AbortError") {
                console.error("Video play error:", err);
              }
            }
          }

          pendingPlayRef.current = false;
        }
      } else {
        pause();
        setCurrentTime(totalDuration);
      }
    };

    video.addEventListener("ended", handleEnded);
    return () => video.removeEventListener("ended", handleEnded);
  }, [isPlaying, clips, currentClipIndex, pause, totalDuration, videoPool]);

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
