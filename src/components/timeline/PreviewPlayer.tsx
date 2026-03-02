import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MpvPlayer } from "../../hooks/useMpvPlayer";
import { TimelineClip } from "../../lib/timeline-utils";

interface PreviewPlayerProps {
  clips: TimelineClip[];
  mpv: MpvPlayer;
}

export default function PreviewPlayer({ clips, mpv }: PreviewPlayerProps) {
  // Start mpv when this component mounts; stop on unmount
  useEffect(() => {
    let cancelled = false;

    mpv.start().then(() => {
      if (cancelled) mpv.stop();
    });

    return () => {
      cancelled = true;
      mpv.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep mpv window aligned when the app window moves or resizes
  useEffect(() => {
    const el = mpv.containerRef.current;
    if (!el) return;

    let rafId = 0;
    const syncGeometry = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => mpv.syncGeometry());
    };

    const observer = new ResizeObserver(syncGeometry);
    observer.observe(el);

    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    const win = getCurrentWindow();
    win.onMoved(syncGeometry).then((fn) => { unlistenMoved = fn; });
    win.onResized(syncGeometry).then((fn) => { unlistenResized = fn; });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [mpv]);

  if (clips.length === 0) {
    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
        <div className="text-gray-500 text-center p-8">
          <p className="text-lg font-medium">No videos available</p>
          <p className="text-sm mt-1">Generate videos in the Storyboard tab first</p>
        </div>
      </div>
    );
  }

  return (
    // mpv renders as an X11 child window overlaid on this div
    <div
      ref={mpv.containerRef}
      className="bg-black rounded-lg overflow-hidden aspect-video"
    />
  );
}
