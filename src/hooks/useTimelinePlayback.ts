import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  resolvePlayheadState,
  resolvePlaybackStart,
  getFollowingClip,
  getTotalDuration,
} from "../lib/timeline-utils";
import { VideoPool } from "./useVideoPool";

interface UseTimelinePlaybackOptions {
  clips: TimelineClip[];
  pool: VideoPool;
}

/** Wall-clock anchor used to advance the playhead through a gap (black screen) */
interface GapAnchor {
  wallClock: number;
  timelineTime: number;
}

/** Playhead state updates are throttled to this interval during playback */
const PLAYHEAD_UPDATE_MS = 40;
/** How close to trim-out counts as the end of a clip */
const CLIP_END_EPSILON = 0.03;

export function useTimelinePlayback({ clips, pool }: UseTimelinePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const pendingRef = useRef(false);
  // Id of the clip currently on screen; null while traversing a gap
  const activeClipIdRef = useRef<string | null>(null);
  const gapAnchorRef = useRef<GapAnchor | null>(null);
  const lastPlayheadUpdateRef = useRef(0);

  const totalDuration = getTotalDuration(clips);

  // Show a clip and warm the hidden element with whatever follows it
  const startClip = useCallback(
    async (clip: TimelineClip, localTime: number, play: boolean) => {
      activeClipIdRef.current = clip.clipId;
      gapAnchorRef.current = null;
      await pool.showClip(clip, localTime, play);
      const following = getFollowingClip(clip, clips);
      if (following?.clip.videoUrl) {
        pool.preload(following.clip, following.localTime).catch(() => {});
      }
    },
    [pool, clips]
  );

  // Enter gap traversal: black screen, playhead advances on wall-clock time
  const startGap = useCallback(
    (timelineTime: number) => {
      activeClipIdRef.current = null;
      gapAnchorRef.current = { wallClock: performance.now(), timelineTime };
      pool.hideAll();
    },
    [pool]
  );

  const play = useCallback(async () => {
    if (clips.length === 0 || pendingRef.current) return;
    pendingRef.current = true;

    const start = resolvePlaybackStart(currentTime, clips);
    if (start && start.state.kind !== "end") {
      setCurrentTime(start.timelineTime);
      if (start.state.kind === "clip" && start.state.clip.videoUrl) {
        await startClip(start.state.clip, start.state.localTime, true);
      } else {
        startGap(start.timelineTime);
      }
      setIsPlaying(true);
    }
    pendingRef.current = false;
  }, [clips, currentTime, startClip, startGap]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    gapAnchorRef.current = null;
    pendingRef.current = false;
    pool.pause();
  }, [pool]);

  const seek = useCallback(
    async (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clamped);

      const state = resolvePlayheadState(clamped, clips);
      if (state.kind === "clip" && state.clip.videoUrl) {
        // Preserve transport state: keep rolling if playing, else show the frame
        await startClip(state.clip, state.localTime, isPlaying);
      } else if (state.kind === "gap") {
        activeClipIdRef.current = null;
        pool.hideAll();
        gapAnchorRef.current = isPlaying
          ? { wallClock: performance.now(), timelineTime: clamped }
          : null;
      } else {
        activeClipIdRef.current = null;
        gapAnchorRef.current = null;
        pool.hideAll();
        setIsPlaying(false);
      }
    },
    [clips, totalDuration, pool, isPlaying, startClip]
  );

  const skipToStart = useCallback(() => seek(0), [seek]);
  const skipToEnd = useCallback(() => seek(totalDuration), [seek, totalDuration]);
  const skipBackward = useCallback(() => seek(Math.max(0, currentTime - 5)), [seek, currentTime]);
  const skipForward = useCallback(
    () => seek(Math.min(totalDuration, currentTime + 5)),
    [seek, currentTime, totalDuration]
  );

  // Drive the playhead while playing: read the active element's position,
  // advance on wall-clock time through gaps, and handle clip transitions.
  useEffect(() => {
    if (!isPlaying || clips.length === 0) return;

    let rafId = 0;

    const stopAtEnd = () => {
      setIsPlaying(false);
      gapAnchorRef.current = null;
      pool.pause();
      setCurrentTime(totalDuration);
    };

    const updatePlayhead = (time: number) => {
      const now = performance.now();
      if (now - lastPlayheadUpdateRef.current < PLAYHEAD_UPDATE_MS) return;
      lastPlayheadUpdateRef.current = now;
      setCurrentTime(time);
    };

    const transitionFrom = async (clip: TimelineClip) => {
      const endTime = clip.startOffset + clip.effectiveDuration;
      const state = resolvePlayheadState(endTime + 0.001, clips);
      if (state.kind === "clip" && state.clip.videoUrl) {
        setCurrentTime(endTime);
        await startClip(state.clip, state.localTime, true);
      } else if (state.kind === "gap") {
        setCurrentTime(endTime);
        startGap(endTime);
      } else {
        stopAtEnd();
      }
    };

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (pendingRef.current) return;

      const activeClipId = activeClipIdRef.current;
      if (activeClipId) {
        const clip = clips.find((c) => c.clipId === activeClipId);
        if (!clip) return;
        const pos = pool.getPosition();
        if (pos === null) return;

        if (pos >= clip.trimOut - CLIP_END_EPSILON || pool.isEnded()) {
          pendingRef.current = true;
          transitionFrom(clip).finally(() => {
            pendingRef.current = false;
          });
        } else {
          updatePlayhead(clip.startOffset + (pos - clip.trimIn));
        }
      } else {
        const anchor = gapAnchorRef.current;
        if (!anchor) return;
        const newTime =
          anchor.timelineTime + (performance.now() - anchor.wallClock) / 1000;
        const state = resolvePlayheadState(newTime, clips);

        if (state.kind === "clip" && state.clip.videoUrl) {
          pendingRef.current = true;
          setCurrentTime(newTime);
          startClip(state.clip, state.localTime, true).finally(() => {
            pendingRef.current = false;
          });
        } else if (state.kind === "gap") {
          updatePlayhead(newTime);
        } else {
          stopAtEnd();
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, clips, pool, totalDuration, startClip, startGap]);

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
