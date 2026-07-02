import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  resolvePlayheadState,
  resolvePlaybackStart,
  getFollowingClip,
  getTotalDuration,
} from "../lib/timeline-utils";
import { VideoPool } from "./useVideoPool";
import { snapToKeyframeGrid } from "../lib/media-pipeline";

// Transport tracing through the dev console tap; playback state bugs are
// invisible in screenshots, so every state decision announces itself
const trace = (msg: string) => console.warn(`[transport] ${msg}`);

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
  const lastHealAttemptRef = useRef(0);
  // Playback is suspended while the user drags the playhead; seeking a
  // decoder that is simultaneously playing is what smears frames
  const scrubRef = useRef<{ active: boolean; wasPlaying: boolean }>({
    active: false,
    wasPlaying: false,
  });

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
    try {
      const start = resolvePlaybackStart(currentTime, clips);
      trace(`play() from ${currentTime.toFixed(2)} -> ${start ? `${start.state.kind}@${start.timelineTime.toFixed(2)}` : "null"}`);
      if (start && start.state.kind !== "end") {
        setCurrentTime(start.timelineTime);
        if (start.state.kind === "clip" && start.state.clip.videoUrl) {
          await startClip(start.state.clip, start.state.localTime, true);
        } else {
          startGap(start.timelineTime);
        }
        setIsPlaying(true);
      }
    } finally {
      // Never leave the transport wedged if a start fails mid-flight
      pendingRef.current = false;
    }
  }, [clips, currentTime, startClip, startGap]);

  const pause = useCallback(() => {
    trace("pause()");
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

  // Scrub drag: suspend playback on grab, fast-seek paused previews while
  // dragging, land precisely and resume on release
  const beginScrub = useCallback(() => {
    if (scrubRef.current.active) return;
    scrubRef.current = { active: true, wasPlaying: isPlaying };
    if (isPlaying) pool.pause();
  }, [isPlaying, pool]);

  const scrub = useCallback(
    async (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clamped);

      const state = resolvePlayheadState(clamped, clips);
      if (state.kind === "clip" && state.clip.videoUrl) {
        activeClipIdRef.current = state.clip.clipId;
        gapAnchorRef.current = null;
        // Preview on the keyframe grid: keyframe decodes need no reference
        // buffers, so they can't smear against recycled decoder state
        const snapped = snapToKeyframeGrid(state.localTime, state.clip.trimIn, state.clip.trimOut);
        await pool.showClip(state.clip, snapped, false, { fastScrub: true });
      } else {
        activeClipIdRef.current = null;
        pool.hideAll();
      }
    },
    [clips, totalDuration, pool]
  );

  const endScrub = useCallback(
    async (time: number) => {
      if (!scrubRef.current.active) {
        await seek(time);
        return;
      }
      const resume = scrubRef.current.wasPlaying && isPlaying;
      scrubRef.current = { active: false, wasPlaying: false };

      const clamped = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clamped);

      trace(`endScrub at ${clamped.toFixed(2)} resume=${resume}`);
      const state = resolvePlayheadState(clamped, clips);
      if (state.kind === "clip" && state.clip.videoUrl) {
        // Land on a keyframe so resume starts from a clean decode
        const snapped = snapToKeyframeGrid(state.localTime, state.clip.trimIn, state.clip.trimOut);
        await startClip(state.clip, snapped, resume);
      } else if (state.kind === "gap") {
        activeClipIdRef.current = null;
        pool.hideAll();
        gapAnchorRef.current = resume
          ? { wallClock: performance.now(), timelineTime: clamped }
          : null;
      } else {
        activeClipIdRef.current = null;
        gapAnchorRef.current = null;
        pool.hideAll();
        setIsPlaying(false);
      }
    },
    [clips, totalDuration, pool, isPlaying, startClip, seek]
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
      trace(`stopAtEnd (total=${totalDuration.toFixed(2)})`);
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
      trace(`clip ${clip.clipId} ended @${endTime.toFixed(2)} -> ${state.kind}`);
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
      // The drive loop stands down entirely while the user is scrubbing
      if (scrubRef.current.active) return;

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
          // Self-heal: a lost play() (interrupted by a seek or a stale op)
          // leaves the element paused while the transport says playing
          if (pool.isPaused()) {
            const now = performance.now();
            if (now - lastHealAttemptRef.current > 500) {
              lastHealAttemptRef.current = now;
              pool.play().catch(() => {});
            }
          }
        }
      } else {
        const anchor = gapAnchorRef.current;
        if (!anchor) return;
        const newTime =
          anchor.timelineTime + (performance.now() - anchor.wallClock) / 1000;
        const state = resolvePlayheadState(newTime, clips);

        if (state.kind === "clip" && state.clip.videoUrl) {
          trace(`gap -> clip ${state.clip.clipId} @${newTime.toFixed(2)}`);
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
    beginScrub,
    scrub,
    endScrub,
    skipToStart,
    skipToEnd,
    skipBackward,
    skipForward,
  };
}
