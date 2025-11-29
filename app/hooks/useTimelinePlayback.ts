import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  timelineToClipTime,
  clipToTimelineTime,
  getTotalDuration,
} from "../lib/timeline-utils";

interface UseTimelinePlaybackOptions {
  clips: TimelineClip[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Helper to safely play video after source change
 * Waits for canplay event if source was just changed
 */
async function safePlay(
  video: HTMLVideoElement,
  newSrc: string | undefined,
  seekTime: number
): Promise<void> {
  if (!newSrc) return;

  const currentSrcBase = video.src.split("?")[0];
  const newSrcBase = newSrc.split("?")[0];
  const needsSourceChange = !video.src || !currentSrcBase.includes(newSrcBase);

  if (needsSourceChange) {
    video.src = newSrc;

    // Wait for video to be ready
    await new Promise<void>((resolve) => {
      const onCanPlay = () => {
        video.removeEventListener("canplay", onCanPlay);
        resolve();
      };
      video.addEventListener("canplay", onCanPlay);
      video.load();
    });
  }

  video.currentTime = seekTime;

  try {
    await video.play();
  } catch (err) {
    // Ignore AbortError from interrupted play requests
    if (err instanceof Error && err.name !== "AbortError") {
      console.error("Video play error:", err);
    }
  }
}

export function useTimelinePlayback({
  clips,
  videoRef,
}: UseTimelinePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const pendingPlayRef = useRef<boolean>(false);

  const totalDuration = getTotalDuration(clips);

  const play = useCallback(async () => {
    if (clips.length === 0) return;

    const video = videoRef.current;
    if (!video) return;

    // Prevent multiple concurrent play attempts
    if (pendingPlayRef.current) return;
    pendingPlayRef.current = true;

    setIsPlaying(true);

    const mapping = timelineToClipTime(currentTime, clips);
    if (mapping) {
      const clip = clips[mapping.clipIndex];
      setCurrentClipIndex(mapping.clipIndex);
      await safePlay(video, clip.shot.video_url ?? undefined, mapping.localTime);
    }

    pendingPlayRef.current = false;
  }, [clips, currentTime, videoRef]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    pendingPlayRef.current = false;
    videoRef.current?.pause();
  }, [videoRef]);

  const seek = useCallback(
    (time: number) => {
      const clampedTime = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clampedTime);

      const mapping = timelineToClipTime(clampedTime, clips);
      if (mapping) {
        setCurrentClipIndex(mapping.clipIndex);

        const video = videoRef.current;
        const clip = clips[mapping.clipIndex];

        if (video && clip.shot.video_url) {
          // Always update source if needed
          if (!video.src.includes(clip.shot.video_url.split("?")[0])) {
            video.src = clip.shot.video_url;
          }
          video.currentTime = mapping.localTime;
        }
      }
    },
    [clips, totalDuration, videoRef]
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
    const video = videoRef.current;
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

            await safePlay(
              video,
              nextClip.shot.video_url,
              nextClip.edit?.trim_in ?? 0
            );
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
  }, [isPlaying, clips, currentClipIndex, pause, totalDuration, videoRef]);

  // Handle video ended event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = async () => {
      if (!isPlaying || pendingPlayRef.current) return;

      const nextIndex = currentClipIndex + 1;
      if (nextIndex < clips.length) {
        const nextClip = clips[nextIndex];
        if (nextClip.shot.video_url) {
          pendingPlayRef.current = true;
          setCurrentClipIndex(nextIndex);

          await safePlay(
            video,
            nextClip.shot.video_url,
            nextClip.edit?.trim_in ?? 0
          );
          pendingPlayRef.current = false;
        }
      } else {
        pause();
        setCurrentTime(totalDuration);
      }
    };

    video.addEventListener("ended", handleEnded);
    return () => video.removeEventListener("ended", handleEnded);
  }, [isPlaying, clips, currentClipIndex, pause, totalDuration, videoRef]);

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
