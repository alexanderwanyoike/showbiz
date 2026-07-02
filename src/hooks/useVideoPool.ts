import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { TimelineClip } from "../lib/timeline-utils";
import { createObjectUrlCache, fetchVideoBlob } from "../lib/object-url-cache";
import {
  createSeekCoalescer,
  waitForMediaEvent,
  mediaOpenQueue,
  type SeekCoalescer,
} from "../lib/media-pipeline";

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
  /**
   * Make a clip visible at a source-file position, playing or paused.
   * `fastScrub` trades seek precision for speed (keyframe-snapped preview)
   * while dragging; the release seek should be precise.
   */
  showClip: (
    clip: TimelineClip,
    localTime: number,
    play: boolean,
    opts?: { fastScrub?: boolean }
  ) => Promise<void>;
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
  /** Canvas that holds the last good frame while a seek is decoding */
  freezeCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** True while a seek is in flight; the preview shows the freeze frame */
  isSeekHolding: boolean;
}

interface Assignment {
  clipId: string;
  videoUrl: string;
}

/** How long a seek may decode before we retry, then rebuild the pipeline */
const SEEK_TIMEOUT_MS = 1200;
const METADATA_TIMEOUT_MS = 3000;


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

  // While a seek decodes, the preview shows the last good frame instead of
  // WebKitGTK's half-decoded intermediate paints
  const freezeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seekHoldCountRef = useRef(0);
  const [isSeekHolding, setIsSeekHolding] = useState(false);

  const beginSeekHold = useCallback((el: HTMLVideoElement) => {
    if (seekHoldCountRef.current === 0) {
      // First seek of a storm: snapshot the frame currently on screen
      const canvas = freezeCanvasRef.current;
      if (canvas && el.readyState >= 2 && el.videoWidth > 0) {
        canvas.width = el.videoWidth;
        canvas.height = el.videoHeight;
        canvas.getContext("2d")?.drawImage(el, 0, 0);
      }
    }
    seekHoldCountRef.current += 1;
    setIsSeekHolding(true);
  }, []);

  const endSeekHold = useCallback(() => {
    seekHoldCountRef.current = Math.max(0, seekHoldCountRef.current - 1);
    if (seekHoldCountRef.current === 0) setIsSeekHolding(false);
  }, []);

  // One coalescer per element: scrub storms replace each other's targets
  // instead of stacking seeks on a decoder that is still mid-seek. Every
  // wait is bounded: a swallowed `seeked` gets one retry, then the media
  // pipeline is rebuilt from the cached blob (el.load()) — an unbounded
  // wait here deadlocks the whole transport (observed on WebKitGTK).
  type SeekTarget = { time: number; fast: boolean };
  const seekCoalescersRef = useRef<[SeekCoalescer<SeekTarget> | null, SeekCoalescer<SeekTarget> | null]>([null, null]);
  const coalescedSeek = useCallback(
    (index: number, target: SeekTarget): Promise<void> => {
      let coalescer = seekCoalescersRef.current[index];
      if (!coalescer) {
        coalescer = createSeekCoalescer<SeekTarget>(async ({ time, fast }) => {
          const el = element(index) as
            | (HTMLVideoElement & { fastSeek?: (t: number) => void })
            | null;
          if (!el) return;
          if (Math.abs(el.currentTime - time) < 0.05) return;

          beginSeekHold(el);
          try {
            for (let attempt = 0; attempt < 2; attempt++) {
              const settled = waitForMediaEvent(el, "seeked", SEEK_TIMEOUT_MS);
              if (fast && typeof el.fastSeek === "function") {
                el.fastSeek(time);
              } else {
                el.currentTime = time;
              }
              const outcome = await settled;
              if (outcome === "event") {
                // WebKitGTK's software pipeline often paints a partially
                // decoded frame for a paused seek and leaves it on screen.
                // A micro play/pause makes the decoder compose a real frame.
                if (el.paused) {
                  await el.play().catch(() => {});
                  await new Promise((r) => setTimeout(r, 60));
                  el.pause();
                }
                return;
              }
              console.warn(`[video-pool] seek ${outcome} on element ${index}, attempt ${attempt + 1}`);
            }

            // Pipeline is wedged: rebuild it from the cached blob and land once
            const ready = waitForMediaEvent(el, "loadedmetadata", METADATA_TIMEOUT_MS);
            el.load();
            await ready;
            const settled = waitForMediaEvent(el, "seeked", SEEK_TIMEOUT_MS);
            el.currentTime = time;
            await settled;
            console.warn(`[video-pool] element ${index} recovered via pipeline reload`);
          } finally {
            endSeekHold();
          }
        });
        seekCoalescersRef.current[index] = coalescer;
      }
      return coalescer.request(target);
    },
    [element, beginSeekHold, endSeekHold]
  );

  // Ensure the element at `index` holds the clip's video, seeked to localTime
  const loadInto = useCallback(
    async (index: number, clip: TimelineClip, localTime: number, fast = false) => {
      const el = element(index);
      const videoUrl = clip.videoUrl;
      if (!el || !videoUrl) return;

      const current = assignmentsRef.current[index];
      if (current?.clipId !== clip.clipId || current?.videoUrl !== videoUrl) {
        assignmentsRef.current[index] = { clipId: clip.clipId, videoUrl };
        const objectUrl = await cache.get(videoUrl);
        if (el.src !== objectUrl) {
          // Opens go through the app-wide gate (racing opens fail
          // sporadically on WebKitGTK) and retry once through a pipeline
          // reset before giving up on this load
          await mediaOpenQueue.run(async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
              const ready = waitForMediaEvent(el, "loadedmetadata", METADATA_TIMEOUT_MS);
              el.src = objectUrl;
              const outcome = await ready;
              if (outcome === "event") return;
              console.warn(`[video-pool] metadata ${outcome} on element ${index}, attempt ${attempt + 1}`);
              el.removeAttribute("src");
              el.load();
              await new Promise((r) => setTimeout(r, 250));
            }
          });
        }
      }
      await coalescedSeek(index, { time: localTime, fast });
    },
    [cache, element, coalescedSeek]
  );

  const setActive = useCallback((index: number | null) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, []);

  const showClip = useCallback(
    async (
      clip: TimelineClip,
      localTime: number,
      play: boolean,
      opts?: { fastScrub?: boolean }
    ) => {
      const token = ++opTokenRef.current;

      // Reuse whichever element already holds this clip, else the hidden one
      const existing = assignmentsRef.current.findIndex((a) => a?.clipId === clip.clipId);
      const index = existing >= 0 ? existing : activeIndexRef.current === 0 ? 1 : 0;

      await loadInto(index, clip, localTime, opts?.fastScrub ?? false);
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
      freezeCanvasRef,
      isSeekHolding,
    }),
    [videoRefs, activeIndex, showClip, preload, play, pause, hideAll, getPosition, isEnded, isPaused, isSeekHolding]
  );
}
