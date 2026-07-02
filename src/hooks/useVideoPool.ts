import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { TimelineClip } from "../lib/timeline-utils";
import { createObjectUrlCache, fetchVideoBlob } from "../lib/object-url-cache";
import { createSeekCoalescer, type SeekCoalescer } from "../lib/media-pipeline";

/**
 * Two-element HTML5 video pool for timeline playback.
 *
 * At most two <video> elements are ever mounted (a third concurrent decode
 * pipeline is unreliable in WebKitGTK, see docs/html5-video-migration.md):
 * the visible active clip and a hidden preloaded next clip. Sources are blob
 * object URLs (asset:// cannot feed <video> on Linux), cached per file.
 */
export interface VideoPool {
  videoRefs: [
    React.RefObject<HTMLVideoElement | null>,
    React.RefObject<HTMLVideoElement | null>,
  ];
  /** Which element is visible; null shows the black container (gap/empty) */
  activeIndex: number | null;
  /** Make a clip visible at a source-file position, playing or paused */
  showClip: (clip: TimelineClip, localTime: number, play: boolean) => Promise<void>;
  /** Load a clip into the hidden element, seeked and paused, ready to swap */
  preload: (clip: TimelineClip, localTime: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  /** Pause both elements and show the black container */
  hideAll: () => void;
  /** Current source-file position of the visible element */
  getPosition: () => number | null;
  /** Whether the visible element has reached the end of its file */
  isEnded: () => boolean;
  /** Whether the visible element is paused (e.g. a play() attempt was lost) */
  isPaused: () => boolean;
}

interface Assignment {
  clipId: string;
  videoUrl: string;
}

function waitForEvent(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`video error while waiting for ${event}`));
    };
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}


export function useVideoPool(): VideoPool {
  const refA = useRef<HTMLVideoElement | null>(null);
  const refB = useRef<HTMLVideoElement | null>(null);
  const videoRefs = useMemo(
    () => [refA, refB] as VideoPool["videoRefs"],
    []
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const assignmentsRef = useRef<[Assignment | null, Assignment | null]>([null, null]);
  // Stale async operations (rapid scrubs) must not apply their play/pause
  const opTokenRef = useRef(0);

  const cache = useMemo(() => createObjectUrlCache(fetchVideoBlob), []);
  useEffect(() => {
    return () => {
      cache.revokeAll();
    };
  }, [cache]);

  const element = useCallback(
    (index: number) => videoRefs[index].current,
    [videoRefs]
  );

  // One coalescer per element: scrub storms replace each other's targets
  // instead of stacking seeks on a decoder that is still mid-seek (stacked
  // seeks are what smear frames on WebKitGTK's software pipeline)
  const seekCoalescersRef = useRef<[SeekCoalescer | null, SeekCoalescer | null]>([null, null]);
  const coalescedSeek = useCallback(
    (index: number, target: number): Promise<void> => {
      let coalescer = seekCoalescersRef.current[index];
      if (!coalescer) {
        coalescer = createSeekCoalescer(async (localTime) => {
          const el = element(index);
          if (!el) return;
          if (Math.abs(el.currentTime - localTime) < 0.05) return;
          const seeked = waitForEvent(el, "seeked");
          el.currentTime = localTime;
          await seeked;
        });
        seekCoalescersRef.current[index] = coalescer;
      }
      return coalescer.request(target);
    },
    [element]
  );

  // Ensure the element at `index` holds the clip's video, seeked to localTime
  const loadInto = useCallback(
    async (index: number, clip: TimelineClip, localTime: number) => {
      const el = element(index);
      const videoUrl = clip.videoUrl;
      if (!el || !videoUrl) return;

      const current = assignmentsRef.current[index];
      if (current?.clipId !== clip.clipId || current?.videoUrl !== videoUrl) {
        assignmentsRef.current[index] = { clipId: clip.clipId, videoUrl };
        const objectUrl = await cache.get(videoUrl);
        if (el.src !== objectUrl) {
          const ready = waitForEvent(el, "loadedmetadata");
          el.src = objectUrl;
          await ready;
        }
      }
      await coalescedSeek(index, localTime);
    },
    [cache, element, coalescedSeek]
  );

  const setActive = useCallback((index: number | null) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, []);

  const showClip = useCallback(
    async (clip: TimelineClip, localTime: number, play: boolean) => {
      const token = ++opTokenRef.current;

      // Reuse whichever element already holds this clip, else the hidden one
      const existing = assignmentsRef.current.findIndex((a) => a?.clipId === clip.clipId);
      const index = existing >= 0 ? existing : activeIndexRef.current === 0 ? 1 : 0;

      await loadInto(index, clip, localTime);
      if (token !== opTokenRef.current) return; // superseded by a newer op

      const other = element(1 - index);
      other?.pause();
      setActive(index);

      const el = element(index);
      if (!el) return;
      if (play) {
        await el.play().catch(() => {});
      } else {
        el.pause();
      }
    },
    [element, loadInto, setActive]
  );

  const preload = useCallback(
    async (clip: TimelineClip, localTime: number) => {
      const index = activeIndexRef.current === 0 ? 1 : 0;
      // Never evict the visible clip to preload another
      if (index === activeIndexRef.current) return;
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
    setActive(null);
  }, [element, setActive]);

  const getPosition = useCallback((): number | null => {
    const index = activeIndexRef.current;
    if (index === null) return null;
    return element(index)?.currentTime ?? null;
  }, [element]);

  const isEnded = useCallback((): boolean => {
    const index = activeIndexRef.current;
    if (index === null) return false;
    return element(index)?.ended ?? false;
  }, [element]);

  const isPaused = useCallback((): boolean => {
    const index = activeIndexRef.current;
    if (index === null) return false;
    return element(index)?.paused ?? false;
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
