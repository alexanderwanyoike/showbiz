import { useRef, useState, useEffect, useCallback } from "react";
import { ImageIcon, Play, Film, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { assetUrlToPath } from "../lib/tauri-api";

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
  const [showMpv, setShowMpv] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mpvActiveRef = useRef(false);

  // Stop mpv helper
  const stopMpv = useCallback(() => {
    if (mpvActiveRef.current) {
      mpvActiveRef.current = false;
      invoke("mpv_stop").catch(() => {});
    }
    setShowMpv(false);
  }, []);

  // Reset when shot changes
  useEffect(() => {
    stopMpv();
  }, [shot?.id, stopMpv]);

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
              {hasImage && (
                <img
                  src={shot.image_url!}
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
                  onClick={() => setShowMpv(true)}
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
      <div className="flex items-center justify-between px-3 py-1.5 bg-background/80 border-t border-border text-xs text-muted-foreground">
        <span className="font-mono">
          Shot #{shot.order}
        </span>
        <span className="font-mono uppercase">
          {shot.status}
        </span>
      </div>
    </div>
  );
}
