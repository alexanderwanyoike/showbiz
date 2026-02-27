import { useRef, useState, useCallback, useEffect } from "react";
import { TimelineClip } from "../lib/timeline-utils";

interface UseVideoPoolOptions {
  clips: TimelineClip[];
}

interface VideoPoolState {
  // Which pool index (0 or 1) is currently active/visible
  activeIndex: number;
  // Which clip index is loaded in each pool slot (-1 = none)
  loadedClips: [number, number];
}

/**
 * Manages a pool of 2 video elements for seamless clip transitions.
 * Preloads the next clip while current plays, then swaps instantly.
 */
export function useVideoPool({ clips }: UseVideoPoolOptions) {
  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([
    null,
    null,
  ]);

  const [state, setState] = useState<VideoPoolState>({
    activeIndex: 0,
    loadedClips: [-1, -1],
  });

  // Set a video ref by pool index
  const setVideoRef = useCallback(
    (index: 0 | 1, el: HTMLVideoElement | null) => {
      videoRefs.current[index] = el;
    },
    []
  );

  // Get the currently active video element
  const getActiveVideo = useCallback(() => {
    return videoRefs.current[state.activeIndex];
  }, [state.activeIndex]);

  // Get the inactive (preload) video element
  const getInactiveVideo = useCallback(() => {
    const inactiveIndex = state.activeIndex === 0 ? 1 : 0;
    return videoRefs.current[inactiveIndex];
  }, [state.activeIndex]);

  // Preload a clip into the inactive video element
  const preloadClip = useCallback(
    async (clipIndex: number): Promise<boolean> => {
      if (clipIndex < 0 || clipIndex >= clips.length) {
        return false;
      }

      const clip = clips[clipIndex];
      if (!clip?.shot.video_url) {
        return false;
      }

      const inactiveIndex = state.activeIndex === 0 ? 1 : 0;

      // Already loaded in this slot
      if (state.loadedClips[inactiveIndex] === clipIndex) {
        return true;
      }

      const video = videoRefs.current[inactiveIndex];
      if (!video) {
        return false;
      }

      return new Promise((resolve) => {
        const onCanPlay = () => {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("error", onError);
          setState((prev) => {
            const newLoadedClips: [number, number] = [...prev.loadedClips];
            newLoadedClips[inactiveIndex] = clipIndex;
            return { ...prev, loadedClips: newLoadedClips };
          });
          resolve(true);
        };

        const onError = () => {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("error", onError);
          resolve(false);
        };

        video.addEventListener("canplay", onCanPlay);
        video.addEventListener("error", onError);
        video.src = clip.shot.video_url!;
        video.load();
      });
    },
    [clips, state.activeIndex, state.loadedClips]
  );

  // Switch to a clip - instant if preloaded, otherwise load first
  const switchToClip = useCallback(
    async (
      clipIndex: number,
      seekTime: number = 0
    ): Promise<HTMLVideoElement | null> => {
      if (clipIndex < 0 || clipIndex >= clips.length) {
        return null;
      }

      const clip = clips[clipIndex];
      if (!clip?.shot.video_url) {
        return null;
      }

      const inactiveIndex = state.activeIndex === 0 ? 1 : 0;

      // Check if clip is already loaded in inactive slot (preloaded)
      if (state.loadedClips[inactiveIndex] === clipIndex) {
        const video = videoRefs.current[inactiveIndex];
        if (video) {
          video.currentTime = seekTime;
          setState((prev) => ({
            ...prev,
            activeIndex: inactiveIndex,
          }));
          return video;
        }
      }

      // Check if clip is in active slot (seeking within same clip)
      if (state.loadedClips[state.activeIndex] === clipIndex) {
        const video = videoRefs.current[state.activeIndex];
        if (video) {
          video.currentTime = seekTime;
          return video;
        }
      }

      // Not preloaded - load into inactive slot and switch
      const video = videoRefs.current[inactiveIndex];
      if (!video) {
        return null;
      }

      return new Promise((resolve) => {
        const onCanPlay = () => {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("error", onError);
          video.currentTime = seekTime;
          setState((prev) => {
            const newLoadedClips: [number, number] = [...prev.loadedClips];
            newLoadedClips[inactiveIndex] = clipIndex;
            return {
              activeIndex: inactiveIndex,
              loadedClips: newLoadedClips,
            };
          });
          resolve(video);
        };

        const onError = () => {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("error", onError);
          resolve(null);
        };

        video.addEventListener("canplay", onCanPlay);
        video.addEventListener("error", onError);
        video.src = clip.shot.video_url!;
        video.load();
      });
    },
    [clips, state.activeIndex, state.loadedClips]
  );

  // Initialize first clip when clips change
  useEffect(() => {
    if (clips.length > 0 && state.loadedClips[0] === -1) {
      const firstClip = clips[0];
      if (firstClip?.shot.video_url) {
        const video = videoRefs.current[0];
        if (video) {
          video.src = firstClip.shot.video_url;
          video.load();
          setState((prev) => ({
            ...prev,
            loadedClips: [0, prev.loadedClips[1]],
          }));
        }
      }
    }
  }, [clips, state.loadedClips]);

  return {
    // For rendering the video elements
    setVideoRef,
    activeIndex: state.activeIndex,

    // For playback control
    getActiveVideo,
    getInactiveVideo,

    // For clip management
    preloadClip,
    switchToClip,

    // For checking state
    loadedClips: state.loadedClips,
  };
}

export type VideoPool = ReturnType<typeof useVideoPool>;
