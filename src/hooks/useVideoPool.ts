import { useCallback, useMemo, useRef, useState } from "react";
import type { TimelineClip } from "../lib/timeline-utils";

interface Assignment {
  clipId: string;
  videoUrl: string;
}

export interface VideoPool {
  videoRefs: [
    React.RefObject<HTMLVideoElement | null>,
    React.RefObject<HTMLVideoElement | null>,
  ];
  activeIndex: number | null;
  showClip: (clip: TimelineClip, localTime: number, play: boolean) => Promise<void>;
  preload: (clip: TimelineClip, localTime: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  hideAll: () => void;
  getPosition: () => number | null;
  isEnded: () => boolean;
  isPaused: () => boolean;
}

const METADATA_TIMEOUT_MS = 3000;
const SEEK_TIMEOUT_MS = 1200;

function waitForMediaEvent(
  el: HTMLVideoElement,
  event: "loadedmetadata" | "seeked",
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const settle = () => {
      clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onEvent);
      resolve();
    };
    const onEvent = () => settle();
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onEvent, { once: true });
    timer = setTimeout(settle, timeoutMs);
  });
}

function clampSourceTime(clip: TimelineClip, localTime: number): number {
  return Math.max(clip.trimIn, Math.min(localTime, clip.trimOut));
}

export function useVideoPool(): VideoPool {
  const refA = useRef<HTMLVideoElement | null>(null);
  const refB = useRef<HTMLVideoElement | null>(null);
  const videoRefs = useMemo(
    () => [refA, refB] as VideoPool["videoRefs"],
    []
  );
  const [activeIndex, setActiveIndexState] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const assignmentsRef = useRef<[Assignment | null, Assignment | null]>([null, null]);
  const opTokenRef = useRef(0);

  const element = useCallback(
    (index: number) => videoRefs[index].current,
    [videoRefs]
  );

  const setActiveIndex = useCallback((index: number | null) => {
    activeIndexRef.current = index;
    setActiveIndexState(index);
  }, []);

  const loadInto = useCallback(
    async (index: number, clip: TimelineClip, localTime: number) => {
      const el = element(index);
      const videoUrl = clip.videoUrl;
      if (!el || !videoUrl) return;

      const current = assignmentsRef.current[index];
      if (current?.clipId !== clip.clipId || current.videoUrl !== videoUrl) {
        assignmentsRef.current[index] = { clipId: clip.clipId, videoUrl };
        if (el.src !== videoUrl) {
          el.pause();
          const ready = waitForMediaEvent(el, "loadedmetadata", METADATA_TIMEOUT_MS);
          el.src = videoUrl;
          el.load();
          await ready;
        }
      }

      const targetTime = clampSourceTime(clip, localTime);
      if (Math.abs(el.currentTime - targetTime) >= 0.03) {
        const seeked = waitForMediaEvent(el, "seeked", SEEK_TIMEOUT_MS);
        el.currentTime = targetTime;
        await seeked;
      }
    },
    [element]
  );

  const showClip = useCallback(
    async (clip: TimelineClip, localTime: number, play: boolean) => {
      const token = ++opTokenRef.current;
      const existing = assignmentsRef.current.findIndex(
        (a) => a?.clipId === clip.clipId && a.videoUrl === clip.videoUrl
      );
      const index = existing >= 0 ? existing : activeIndexRef.current === 0 ? 1 : 0;

      await loadInto(index, clip, localTime);
      if (token !== opTokenRef.current) return;

      element(1 - index)?.pause();
      setActiveIndex(index);

      const el = element(index);
      if (!el) return;
      if (play) {
        await el.play().catch(() => {});
      } else {
        el.pause();
      }
    },
    [element, loadInto, setActiveIndex]
  );

  const preload = useCallback(
    async (clip: TimelineClip, localTime: number) => {
      const index = activeIndexRef.current === 0 ? 1 : 0;
      await loadInto(index, clip, localTime);
      element(index)?.pause();
    },
    [element, loadInto]
  );

  const play = useCallback(async () => {
    const index = activeIndexRef.current;
    if (index === null) return;
    await element(index)?.play().catch(() => {});
  }, [element]);

  const pause = useCallback(() => {
    element(0)?.pause();
    element(1)?.pause();
  }, [element]);

  const hideAll = useCallback(() => {
    opTokenRef.current++;
    element(0)?.pause();
    element(1)?.pause();
    setActiveIndex(null);
  }, [element, setActiveIndex]);

  const getPosition = useCallback((): number | null => {
    const index = activeIndexRef.current;
    if (index === null) return null;
    return element(index)?.currentTime ?? null;
  }, [element]);

  const isEnded = useCallback((): boolean => {
    const index = activeIndexRef.current;
    return index === null ? false : element(index)?.ended ?? false;
  }, [element]);

  const isPaused = useCallback((): boolean => {
    const index = activeIndexRef.current;
    return index === null ? false : element(index)?.paused ?? false;
  }, [element]);

  return useMemo(
    () => ({
      videoRefs,
      activeIndex,
      showClip,
      preload,
      play,
      pause,
      hideAll,
      getPosition,
      isEnded,
      isPaused,
    }),
    [videoRefs, activeIndex, showClip, preload, play, pause, hideAll, getPosition, isEnded, isPaused]
  );
}
