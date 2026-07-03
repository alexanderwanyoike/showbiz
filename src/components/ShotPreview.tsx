import { useRef, useState, useEffect, useCallback, type SyntheticEvent } from "react";
import { ImageIcon, Play, Pause, Film, Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { assetUrlToPath } from "../lib/tauri-api";
import { invoke, isElectron } from "../lib/bridge";
import { thumbnailGenerator } from "../lib/thumbnail-generator";
import {
  clampPlaybackTime,
  formatPlaybackTime,
  resolvePreviewStill,
  resolveToggleAction,
  hasReachedEnd,
  type TransportStatus,
} from "../lib/video-preview";

interface ShotPreviewProps {
  shot: {
    id: string;
    order: number;
    image_url: string | null;
    video_url: string | null;
    status: "pending" | "generating" | "complete" | "failed";
  } | null;
}

export default function ShotPreview({ shot }: ShotPreviewProps) {
  return isElectron() ? <ElectronShotPreview shot={shot} /> : <TauriShotPreview shot={shot} />;
}

function ElectronShotPreview({ shot }: ShotPreviewProps) {
  const [status, setStatus] = useState<TransportStatus>("stopped");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekRef = useRef(0);

  const showVideo = status !== "stopped";

  const stopVideo = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      if (metadataLoaded) {
        try {
          video.currentTime = 0;
        } catch (error) {
          console.error("Failed to reset preview video:", error);
        }
      }
    }
    setStatus("stopped");
    setPosition(0);
    pendingSeekRef.current = 0;
  }, [metadataLoaded]);

  useEffect(() => {
    let cancelled = false;
    setPosterUrl(null);
    if (!shot?.video_url) return;

    if (!shot.image_url) {
      thumbnailGenerator
        .extractFrame(shot.video_url, 0)
        .then((frame) => {
          if (!cancelled) setPosterUrl(frame);
        })
        .catch(() => {
          if (!cancelled) setPosterUrl(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [shot?.image_url, shot?.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    video?.pause();
    setStatus("stopped");
    setPosition(0);
    setDuration(0);
    setMetadataLoaded(false);
    pendingSeekRef.current = 0;
  }, [shot?.video_url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shot?.video_url || !metadataLoaded) return;

    if (status === "playing") {
      if (pendingSeekRef.current > 0) {
        const clamped = clampPlaybackTime(pendingSeekRef.current, duration);
        try {
          video.currentTime = clamped;
          setPosition(clamped);
        } catch (error) {
          console.error("Failed to seek preview video:", error);
        }
        pendingSeekRef.current = 0;
      }

      video.play().catch((error) => {
        console.error("Failed to play preview video:", error);
        setStatus((prev) => (prev === "playing" ? "paused" : prev));
      });
    } else {
      video.pause();
    }
  }, [status, shot?.video_url, metadataLoaded, duration]);

  const seekTo = useCallback((nextPosition: number) => {
    const clamped = clampPlaybackTime(nextPosition, duration);
    setPosition(clamped);
    if (!showVideo) {
      pendingSeekRef.current = clamped;
      setStatus("playing");
      return;
    }

    const video = videoRef.current;
    if (video && metadataLoaded) {
      try {
        video.currentTime = clamped;
      } catch (error) {
        console.error("Failed to seek preview video:", error);
      }
    } else {
      pendingSeekRef.current = clamped;
    }
  }, [duration, metadataLoaded, showVideo]);

  const togglePlayback = useCallback(() => {
    if (!shot?.video_url) return;

    switch (resolveToggleAction(status, { position, duration })) {
      case "start":
        setStatus("playing");
        break;
      case "pause":
        videoRef.current?.pause();
        setStatus("paused");
        break;
      case "resume":
        setStatus("playing");
        break;
      case "restart": {
        const video = videoRef.current;
        pendingSeekRef.current = 0;
        if (video && metadataLoaded) {
          try {
            video.currentTime = 0;
          } catch (error) {
            console.error("Failed to restart preview video:", error);
          }
        }
        setPosition(0);
        setStatus("playing");
        break;
      }
    }
  }, [shot?.video_url, status, position, duration, metadataLoaded]);

  const handleLoadedMetadata = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const loadedDuration = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(loadedDuration);
    setMetadataLoaded(true);

    if (pendingSeekRef.current > 0) {
      const clamped = clampPlaybackTime(pendingSeekRef.current, loadedDuration);
      try {
        video.currentTime = clamped;
        setPosition(clamped);
      } catch (error) {
        console.error("Failed to apply pending preview seek:", error);
      }
      pendingSeekRef.current = 0;
    }
  }, []);

  const handleVideoPositionChange = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    if (isSeeking) return;
    const video = event.currentTarget;
    const loadedDuration = Number.isFinite(video.duration) ? video.duration : duration;
    const clamped = clampPlaybackTime(video.currentTime, loadedDuration);
    setPosition(clamped);
    if (hasReachedEnd(clamped, loadedDuration)) {
      setStatus((prev) => (prev === "playing" ? "paused" : prev));
    }
  }, [duration, isSeeking]);

  const handleEnded = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const loadedDuration = Number.isFinite(video.duration) ? video.duration : duration;
    setPosition(clampPlaybackTime(video.currentTime, loadedDuration));
    setStatus((prev) => (prev === "playing" ? "paused" : prev));
  }, [duration]);

  useEffect(() => {
    if (!shot?.video_url) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayback();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(position - (e.shiftKey ? 1 : 0.1));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(position + (e.shiftKey ? 1 : 0.1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shot?.video_url, togglePlayback, seekTo, position]);

  if (!shot) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Film className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">Select a shot to preview</p>
      </div>
    );
  }

  const hasImage = !!shot.image_url;
  const hasVideo = !!shot.video_url;
  const previewStill = resolvePreviewStill(shot.image_url, posterUrl);
  const isGenerating = shot.status === "generating";
  const isEmpty = !hasImage && !hasVideo;

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="relative w-full max-h-full aspect-video">
          {isEmpty ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Generate or upload an image</p>
            </div>
          ) : (
            <>
              {hasVideo && shot.video_url && (
                <video
                  ref={videoRef}
                  src={shot.video_url}
                  preload="metadata"
                  playsInline
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleVideoPositionChange}
                  onSeeked={handleVideoPositionChange}
                  onEnded={handleEnded}
                  onError={(event) => {
                    console.error("Failed to load preview video:", event.currentTarget.error);
                    setStatus((prev) => (prev === "playing" ? "paused" : prev));
                  }}
                  className={`absolute inset-0 h-full w-full bg-black object-contain ${
                    showVideo ? "opacity-100" : "opacity-0 pointer-events-none"
                  }`}
                />
              )}

              {!showVideo && previewStill && (
                <img
                  src={previewStill}
                  alt={`Shot ${shot.order}`}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}

              {isGenerating && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                  <Badge className="bg-primary/90 text-primary-foreground">
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Generating
                  </Badge>
                </div>
              )}

              {showVideo && hasVideo && (
                <button
                  onClick={stopVideo}
                  className="absolute top-2 right-2 z-20 bg-black/60 hover:bg-black/80 rounded p-1 text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {!showVideo && hasVideo && !isGenerating && (
                <button
                  onClick={() => setStatus("playing")}
                  className="absolute inset-0 z-10 flex items-center justify-center group/play"
                >
                  <div className="bg-black/50 group-hover/play:bg-black/70 rounded-full p-4 transition-colors">
                    <Play className="h-8 w-8 text-white fill-white" />
                  </div>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-1.5 bg-background/80 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono">Shot #{shot.order}</span>
          {hasVideo && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => seekTo(position - 0.1)}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                title="Step back 0.1s (Left, Shift for 1s)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={togglePlayback}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                title={status === "playing" ? "Pause (Space)" : "Play (Space)"}
              >
                {status === "playing" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => seekTo(position + 0.1)}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                title="Step forward 0.1s (Right, Shift for 1s)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="font-mono">
            {formatPlaybackTime(position)} / {formatPlaybackTime(duration)}
          </span>
          <span className="font-mono uppercase">{shot.status}</span>
        </div>
        {hasVideo && (
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(position, duration || position)}
            disabled={!duration}
            className="block h-1.5 w-full accent-primary"
            onPointerDown={() => setIsSeeking(true)}
            onPointerUp={(event) => {
              setIsSeeking(false);
              seekTo(Number((event.currentTarget as HTMLInputElement).value));
            }}
            onChange={(event) => setPosition(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") event.preventDefault();
            }}
          />
        )}
      </div>
    </div>
  );
}

function TauriShotPreview({ shot }: ShotPreviewProps) {
  const [status, setStatus] = useState<TransportStatus>("stopped");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mpvActiveRef = useRef(false);
  const pendingSeekRef = useRef(0);

  const showMpv = status !== "stopped";

  // Stop mpv helper
  const stopMpv = useCallback(() => {
    if (mpvActiveRef.current) {
      mpvActiveRef.current = false;
      invoke("mpv_stop").catch(() => {});
    }
    setStatus("stopped");
    setPosition(0);
    pendingSeekRef.current = 0;
  }, []);

  // Reset when shot changes
  useEffect(() => {
    stopMpv();
  }, [shot?.id, stopMpv]);

  useEffect(() => {
    let cancelled = false;
    setDuration(0);
    setPosition(0);
    setPosterUrl(null);
    if (!shot?.video_url) return;

    thumbnailGenerator
      .getVideoDuration(shot.video_url)
      .then((loadedDuration) => {
        if (!cancelled) setDuration(loadedDuration);
      })
      .catch(() => {
        if (!cancelled) setDuration(0);
      });

    if (!shot.image_url) {
      thumbnailGenerator
        .extractFrame(shot.video_url, 0)
        .then((frame) => {
          if (!cancelled) setPosterUrl(frame);
        })
        .catch(() => {
          if (!cancelled) setPosterUrl(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [shot?.image_url, shot?.video_url]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mpvActiveRef.current) {
        invoke("mpv_stop").catch(() => {});
      }
    };
  }, []);

  // Start mpv when showMpv becomes true
  useEffect(() => {
    if (!showMpv || !shot?.video_url) return;
    const el = containerRef.current;
    if (!el) return;

    let destroyed = false;

    async function startMpv() {
      const scale = await getCurrentWindow().scaleFactor();
      const r = el!.getBoundingClientRect();
      const rect = {
        x: Math.round(r.left * scale),
        y: Math.round(r.top * scale),
        w: Math.round(r.width * scale),
        h: Math.round(r.height * scale),
      };
      await invoke("mpv_start", rect);
      if (destroyed) { invoke("mpv_stop"); return; }

      mpvActiveRef.current = true;

      const path = assetUrlToPath(shot!.video_url!);
      if (path) {
        await invoke("mpv_load_file", { path });
        if (pendingSeekRef.current > 0) {
          await invoke("mpv_seek", { seconds: pendingSeekRef.current });
        }
        await invoke("mpv_resume");
      }
    }

    async function sync() {
      if (!el || destroyed) return;
      const scale = await getCurrentWindow().scaleFactor();
      const r = el.getBoundingClientRect();
      invoke("mpv_update_geometry", {
        x: Math.round(r.left * scale),
        y: Math.round(r.top * scale),
        w: Math.round(r.width * scale),
        h: Math.round(r.height * scale),
      }).catch(() => {});
    }

    startMpv().catch(console.error);

    // Sync geometry on window move/resize
    let unlistenMove: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;
    const win = getCurrentWindow();
    win.onMoved(sync).then((fn) => { if (!destroyed) unlistenMove = fn; else fn(); });
    win.onResized(sync).then((fn) => { if (!destroyed) unlistenResize = fn; else fn(); });

    // ResizeObserver for layout changes
    const observer = new ResizeObserver(sync);
    observer.observe(el);

    return () => {
      destroyed = true;
      observer.disconnect();
      unlistenMove?.();
      unlistenResize?.();
      if (mpvActiveRef.current) {
        mpvActiveRef.current = false;
        invoke("mpv_stop").catch(() => {});
      }
    };
  }, [showMpv, shot?.video_url]);

  useEffect(() => {
    if (!showMpv) return;

    const interval = window.setInterval(async () => {
      if (isSeeking) return;
      try {
        const current = await invoke<number>("mpv_get_position");
        const clamped = clampPlaybackTime(current, duration);
        setPosition(clamped);
        // mpv runs with --keep-open=yes, so it pauses itself on the last
        // frame; reflect that in the transport state.
        if (hasReachedEnd(clamped, duration)) {
          setStatus((prev) => (prev === "playing" ? "paused" : prev));
        }
      } catch {
        // mpv may briefly have no time-pos during load or after stop.
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [showMpv, duration, isSeeking]);

  async function seekTo(nextPosition: number) {
    const clamped = clampPlaybackTime(nextPosition, duration);
    setPosition(clamped);
    if (!showMpv) {
      pendingSeekRef.current = clamped;
      setStatus("playing");
      return;
    }
    try {
      await invoke("mpv_seek", { seconds: clamped });
    } catch (error) {
      console.error("Failed to seek preview:", error);
    }
  }

  const togglePlayback = useCallback(async () => {
    if (!shot?.video_url) return;
    try {
      switch (resolveToggleAction(status, { position, duration })) {
        case "start":
          setStatus("playing");
          break;
        case "pause":
          await invoke("mpv_pause");
          setStatus("paused");
          break;
        case "resume":
          await invoke("mpv_resume");
          setStatus("playing");
          break;
        case "restart":
          await invoke("mpv_seek", { seconds: 0 });
          await invoke("mpv_resume");
          setPosition(0);
          setStatus("playing");
          break;
      }
    } catch (error) {
      console.error("Failed to toggle playback:", error);
    }
  }, [shot?.video_url, status, position, duration]);

  // Keyboard transport: Space = play/pause, arrows = step 0.1s (Shift: 1s)
  useEffect(() => {
    if (!shot?.video_url) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayback();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(position - (e.shiftKey ? 1 : 0.1));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(position + (e.shiftKey ? 1 : 0.1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!shot) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Film className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">Select a shot to preview</p>
      </div>
    );
  }

  const hasImage = !!shot.image_url;
  const hasVideo = !!shot.video_url;
  const previewStill = resolvePreviewStill(shot.image_url, posterUrl);
  const isGenerating = shot.status === "generating";
  const isEmpty = !hasImage && !hasVideo;

  return (
    <div className="h-full flex flex-col bg-black">
      {/* 16:9 preview area */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="relative w-full max-h-full aspect-video">
          {isEmpty ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Generate or upload an image</p>
            </div>
          ) : showMpv && hasVideo ? (
            <>
              {/* Inline mpv container — replaces the image */}
              <div
                ref={containerRef}
                className="absolute inset-0 bg-black"
              />
              {/* Stop button overlaid on video */}
              <button
                onClick={stopMpv}
                className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 rounded p-1 text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              {previewStill && (
                <img
                  src={previewStill}
                  alt={`Shot ${shot.order}`}
                  className="w-full h-full object-contain"
                />
              )}

              {/* Generating overlay */}
              {isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Badge className="bg-primary/90 text-primary-foreground">
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Generating
                  </Badge>
                </div>
              )}

              {/* Play video button */}
              {hasVideo && !isGenerating && (
                <button
                  onClick={() => setStatus("playing")}
                  className="absolute inset-0 flex items-center justify-center group/play"
                >
                  <div className="bg-black/50 group-hover/play:bg-black/70 rounded-full p-4 transition-colors">
                    <Play className="h-8 w-8 text-white fill-white" />
                  </div>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="space-y-1.5 bg-background/80 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono">
            Shot #{shot.order}
          </span>
          {hasVideo && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => seekTo(position - 0.1)}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                title="Step back 0.1s (Left, Shift for 1s)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={togglePlayback}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                title={status === "playing" ? "Pause (Space)" : "Play (Space)"}
              >
                {status === "playing" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => seekTo(position + 0.1)}
                className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                title="Step forward 0.1s (Right, Shift for 1s)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="font-mono">
            {formatPlaybackTime(position)} / {formatPlaybackTime(duration)}
          </span>
          <span className="font-mono uppercase">
            {shot.status}
          </span>
        </div>
        {hasVideo && (
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(position, duration || position)}
            disabled={!duration}
            className="block h-1.5 w-full accent-primary"
            onPointerDown={() => setIsSeeking(true)}
            onPointerUp={(event) => {
              setIsSeeking(false);
              seekTo(Number((event.currentTarget as HTMLInputElement).value));
            }}
            onChange={(event) => setPosition(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") event.preventDefault();
            }}
          />
        )}
      </div>
    </div>
  );
}
