import { useRef, useState, useEffect } from "react";
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

  // Reset mpv overlay when shot changes
  useEffect(() => {
    setShowMpv(false);
  }, [shot?.id]);

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
              {hasVideo && !isGenerating && !showMpv && (
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

      {/* MPV overlay */}
      {showMpv && hasVideo && (
        <PreviewMpvOverlay
          videoUrl={shot.video_url!}
          onClose={() => setShowMpv(false)}
        />
      )}
    </div>
  );
}

// ─── MPV overlay for preview video playback ─────────────────────────────────

interface PreviewMpvOverlayProps {
  videoUrl: string;
  onClose: () => void;
}

function PreviewMpvOverlay({ videoUrl, onClose }: PreviewMpvOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

      const path = assetUrlToPath(videoUrl);
      if (path) {
        await invoke("mpv_load_file", { path });
        await invoke("mpv_resume");
      }

      const win = getCurrentWindow();
      const unlistenMove = await win.onMoved(sync);
      const unlistenResize = await win.onResized(sync);
      if (destroyed) {
        unlistenMove(); unlistenResize();
        return;
      }
      (el as HTMLDivElement & { _mpvCleanup?: () => void })._mpvCleanup = () => {
        unlistenMove(); unlistenResize();
      };
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

    return () => {
      destroyed = true;
      (el as HTMLDivElement & { _mpvCleanup?: () => void })._mpvCleanup?.();
      invoke("mpv_stop").catch(() => {});
    };
  }, [videoUrl]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/80"
        onClick={onClose}
      />
      <div className="fixed top-4 left-0 right-0 z-[60] flex items-center justify-end px-6 pointer-events-none">
        <button
          className="text-white bg-black/60 hover:bg-black/80 rounded p-1 pointer-events-auto"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="fixed inset-0 z-[55] flex items-center justify-center pointer-events-none">
        <div
          ref={containerRef}
          className="w-full max-w-4xl aspect-video bg-black"
        />
      </div>
    </>
  );
}
