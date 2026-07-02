import { useState, useCallback, useRef, useEffect } from "react";
import {
  TimelineClip,
  resolvePlayheadState,
  resolvePlaybackStart,
  getTotalDuration,
} from "../lib/timeline-utils";
import { MpvPlayer } from "./useMpvPlayer";
import { resolveSeekAction } from "../lib/seek-utils";

interface UseTimelinePlaybackOptions {
  clips: TimelineClip[];
  mpv: MpvPlayer;
}

/** Wall-clock anchor used to advance the playhead through a gap (black screen) */
interface GapAnchor {
  wallClock: number;
  timelineTime: number;
}

export function useTimelinePlayback({ clips, mpv }: UseTimelinePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const pendingRef = useRef(false);
  const currentFileRef = useRef<string>("");
  // Track which clip is actively loaded; null while traversing a gap
  const activeClipRef = useRef<{ shotId: string; track: string } | null>(null);
  const gapAnchorRef = useRef<GapAnchor | null>(null);

  const totalDuration = getTotalDuration(clips);

  // Load a clip into mpv at the given source-file position and start it
  const startClip = useCallback(
    async (clip: TimelineClip, localTime: number) => {
      const videoUrl = clip.shot.video_url;
      if (!videoUrl) return;
      activeClipRef.current = { shotId: clip.shot.id, track: clip.track };
      gapAnchorRef.current = null;
      await mpv.show();
      const { shouldReload, path } = resolveSeekAction(videoUrl, currentFileRef.current);
      if (shouldReload) {
        await mpv.loadFile(videoUrl, localTime);
        currentFileRef.current = path;
      } else {
        await mpv.seek(localTime);
      }
      await mpv.play();
    },
    [mpv]
  );

  // Enter gap traversal: black screen, playhead advances on wall-clock time
  const startGap = useCallback(
    async (timelineTime: number) => {
      activeClipRef.current = null;
      gapAnchorRef.current = { wallClock: performance.now(), timelineTime };
      await mpv.pause();
      await mpv.hide();
    },
    [mpv]
  );

  const play = useCallback(async () => {
    if (clips.length === 0 || pendingRef.current || !mpv.ready) return;
    pendingRef.current = true;

    const start = resolvePlaybackStart(currentTime, clips);
    if (start && start.state.kind !== "end") {
      setCurrentTime(start.timelineTime);
      if (start.state.kind === "clip") {
        await startClip(start.state.clip, start.state.localTime);
      } else {
        await startGap(start.timelineTime);
      }
      setIsPlaying(true);
    }
    pendingRef.current = false;
  }, [clips, currentTime, mpv, startClip, startGap]);

  const pause = useCallback(async () => {
    setIsPlaying(false);
    gapAnchorRef.current = null;
    pendingRef.current = false;
    await mpv.pause();
  }, [mpv]);

  const seek = useCallback(
    async (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clamped);
      if (!mpv.ready) return;

      const state = resolvePlayheadState(clamped, clips);
      if (state.kind === "clip" && state.clip.shot.video_url) {
        const videoUrl = state.clip.shot.video_url;
        activeClipRef.current = { shotId: state.clip.shot.id, track: state.clip.track };
        gapAnchorRef.current = null;
        await mpv.show();
        const { shouldReload, path } = resolveSeekAction(videoUrl, currentFileRef.current);
        if (shouldReload) {
          await mpv.loadFile(videoUrl, state.localTime);
          currentFileRef.current = path;
        } else {
          await mpv.seek(state.localTime);
        }
        // Preserve transport state: keep rolling if playing, else show the frame
        if (isPlaying) {
          await mpv.play();
        } else {
          await mpv.pause();
        }
      } else {
        // Gap or end of timeline: show black
        activeClipRef.current = null;
        await mpv.pause();
        await mpv.hide();
        if (state.kind === "gap" && isPlaying) {
          gapAnchorRef.current = { wallClock: performance.now(), timelineTime: clamped };
        } else {
          gapAnchorRef.current = null;
          if (state.kind === "end") setIsPlaying(false);
        }
      }
    },
    [clips, totalDuration, mpv, isPlaying]
  );

  const skipToStart = useCallback(() => seek(0), [seek]);
  const skipToEnd = useCallback(() => seek(totalDuration), [seek, totalDuration]);
  const skipBackward = useCallback(() => seek(Math.max(0, currentTime - 5)), [seek, currentTime]);
  const skipForward = useCallback(
    () => seek(Math.min(totalDuration, currentTime + 5)),
    [seek, currentTime, totalDuration]
  );

  // Drive the playhead at ~100 ms while playing: poll mpv inside clips,
  // advance on wall-clock time through gaps, and handle transitions.
  useEffect(() => {
    if (!isPlaying || clips.length === 0) return;

    const stopAtEnd = async () => {
      setIsPlaying(false);
      gapAnchorRef.current = null;
      await mpv.pause();
      setCurrentTime(totalDuration);
    };

    const interval = setInterval(async () => {
      if (pendingRef.current) return;

      const active = activeClipRef.current;
      if (active) {
        const pos = await mpv.getPosition();
        if (pos === null) return;

        const loadedClip = clips.find(
          (c) => c.shot.id === active.shotId && c.track === active.track
        );
        if (!loadedClip) return;

        if (pos >= loadedClip.trimOut - 0.05) {
          // Current clip ended — resolve what the timeline holds next
          const endTime = loadedClip.startOffset + loadedClip.effectiveDuration;
          const state = resolvePlayheadState(endTime + 0.001, clips);

          pendingRef.current = true;
          if (state.kind === "clip") {
            setCurrentTime(state.clip.startOffset);
            await startClip(state.clip, state.localTime);
          } else if (state.kind === "gap") {
            setCurrentTime(endTime);
            await startGap(endTime);
          } else {
            await stopAtEnd();
          }
          pendingRef.current = false;
        } else {
          // Still playing current clip — update timeline position
          const timeInClip = pos - loadedClip.trimIn;
          setCurrentTime(loadedClip.startOffset + timeInClip);
        }
      } else {
        // Gap traversal — advance the playhead on wall-clock time
        const anchor = gapAnchorRef.current;
        if (!anchor) return;

        const newTime =
          anchor.timelineTime + (performance.now() - anchor.wallClock) / 1000;
        const state = resolvePlayheadState(newTime, clips);

        if (state.kind === "clip") {
          pendingRef.current = true;
          setCurrentTime(newTime);
          await startClip(state.clip, state.localTime);
          pendingRef.current = false;
        } else if (state.kind === "gap") {
          setCurrentTime(newTime);
        } else {
          await stopAtEnd();
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, clips, totalDuration, mpv, startClip, startGap]);

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
