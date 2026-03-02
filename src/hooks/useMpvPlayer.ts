import { useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { assetUrlToPath } from "../lib/tauri-api";

export interface MpvPlayer {
  /** Attach this ref to the div that mpv should render inside. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** True once mpv_start has succeeded and mpv_load_file can be called. */
  ready: boolean;
  /** Mount mpv into the container div. Call from a useEffect when the div is visible. */
  start: () => Promise<void>;
  /** Stop mpv and destroy the X11 child window. */
  stop: () => void;
  /** Load and immediately resume playback of a video (asset:// URL or abs path). */
  loadFile: (videoUrlOrPath: string, seekSeconds?: number) => Promise<void>;
  /** Resume playback. */
  play: () => Promise<void>;
  /** Pause playback. */
  pause: () => Promise<void>;
  /** Seek to an absolute position in seconds. */
  seek: (seconds: number) => Promise<void>;
  /** Poll mpv for current playback position. Returns null if not playing. */
  getPosition: () => Promise<number | null>;
  /** Move/resize the mpv X11 child window to match the container div. */
  syncGeometry: () => Promise<void>;
}

async function getRect(el: HTMLElement) {
  const scale = await getCurrentWindow().scaleFactor();
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left * scale),
    y: Math.round(r.top * scale),
    w: Math.round(r.width * scale),
    h: Math.round(r.height * scale),
  };
}

export function useMpvPlayer(): MpvPlayer {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const start = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = await getRect(el);
    await invoke("mpv_start", rect);
    setReady(true);
  }, []);

  const stop = useCallback(() => {
    setReady(false);
    invoke("mpv_stop").catch(() => {});
  }, []);

  const loadFile = useCallback(async (videoUrlOrPath: string, seekSeconds = 0) => {
    // Accept either an asset:// URL or a plain absolute path
    const path = videoUrlOrPath.startsWith("asset://")
      ? assetUrlToPath(videoUrlOrPath)
      : videoUrlOrPath;
    if (!path) return;
    await invoke("mpv_load_file", { path });
    await new Promise((r) => setTimeout(r, 50)); // let mpv open the file
    if (seekSeconds > 0) {
      await invoke("mpv_seek", { seconds: seekSeconds });
    }
    // NO mpv_resume here — callers must explicitly call play()
  }, []);

  const play = useCallback(async () => {
    await invoke("mpv_resume");
  }, []);

  const pause = useCallback(async () => {
    await invoke("mpv_pause");
  }, []);

  const seek = useCallback(async (seconds: number) => {
    await invoke("mpv_seek", { seconds });
  }, []);

  const getPosition = useCallback(async (): Promise<number | null> => {
    try {
      return await invoke<number>("mpv_get_position");
    } catch {
      return null;
    }
  }, []);

  const syncGeometry = useCallback(async () => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const rect = await getRect(el);
    await invoke("mpv_update_geometry", rect).catch(() => {});
  }, [ready]);

  return { containerRef, ready, start, stop, loadFile, play, pause, seek, getPosition, syncGeometry };
}
