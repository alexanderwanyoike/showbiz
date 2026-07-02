import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { getProjects, getStoryboards, getShots } from "../lib/tauri-api";

// THROWAWAY SPIKE — proves whether HTML5 <video> works in this WebView with
// WEBKIT_DISABLE_DMABUF_RENDERER=1 (set in main.rs). If green, playback can
// migrate off mpv entirely. Do not build features on this page.

type SourceMode = "asset" | "blob";

interface VideoDiag {
  readyState: number;
  networkState: number;
  width: number;
  height: number;
  currentTime: number;
  duration: number;
  error: string | null;
  decodedFrames: number | null;
}

const EMPTY_DIAG: VideoDiag = {
  readyState: 0,
  networkState: 0,
  width: 0,
  height: 0,
  currentTime: 0,
  duration: 0,
  error: null,
  decodedFrames: null,
};

function readDiag(v: HTMLVideoElement): VideoDiag {
  const anyV = v as HTMLVideoElement & { webkitDecodedFrameCount?: number };
  return {
    readyState: v.readyState,
    networkState: v.networkState,
    width: v.videoWidth,
    height: v.videoHeight,
    currentTime: v.currentTime,
    duration: v.duration || 0,
    error: v.error ? `code ${v.error.code}: ${v.error.message}` : null,
    decodedFrames: anyV.webkitDecodedFrameCount ?? null,
  };
}

const LOGGED_EVENTS = [
  "loadedmetadata",
  "canplay",
  "playing",
  "pause",
  "seeked",
  "waiting",
  "stalled",
  "error",
  "ended",
];

function SpikeVideo({
  label,
  assetUrl,
  mode,
  overlay,
}: {
  label: string;
  assetUrl: string;
  mode: SourceMode;
  overlay?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [diag, setDiag] = useState<VideoDiag>(EMPTY_DIAG);
  const [events, setEvents] = useState<string[]>([]);

  // Resolve the source for the chosen mode
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (mode === "asset") {
      setSrc(assetUrl);
    } else {
      setSrc(null);
      window
        .fetch(assetUrl)
        .then((r) => r.blob())
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        })
        .catch((e) => {
          if (!cancelled) setEvents((prev) => [`blob fetch failed: ${e}`, ...prev]);
        });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetUrl, mode]);

  // Event log + diagnostics poll
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const log = (e: Event) =>
      setEvents((prev) => [`${new Date().toISOString().slice(11, 19)} ${e.type}`, ...prev.slice(0, 30)]);
    for (const name of LOGGED_EVENTS) v.addEventListener(name, log);

    const interval = setInterval(() => setDiag(readDiag(v)), 250);
    return () => {
      for (const name of LOGGED_EVENTS) v.removeEventListener(name, log);
      clearInterval(interval);
    };
  }, [src]);

  const v = () => videoRef.current;

  return (
    <div className="rounded border border-border p-3 space-y-2">
      <p className="text-sm font-medium">
        {label} <span className="text-muted-foreground">({mode} src)</span>
      </p>
      <div className="relative aspect-video bg-black rounded overflow-hidden">
        {src && (
          <video
            ref={videoRef}
            src={src}
            className="h-full w-full object-contain"
            playsInline
          />
        )}
        {overlay && (
          <>
            {/* DOM-over-video test: if you can read this ON TOP of moving video, overlays work */}
            <div className="absolute left-3 top-3 rounded bg-red-600/80 px-2 py-1 text-sm font-bold text-white">
              OVERLAY TEST — text over video
            </div>
            <div className="absolute bottom-3 right-3 h-16 w-16 rounded-full border-4 border-yellow-400 bg-blue-500/50" />
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => v()?.play()}>Play</Button>
        <Button size="sm" variant="outline" onClick={() => v()?.pause()}>Pause</Button>
        <Button size="sm" variant="outline" onClick={() => { const el = v(); if (el) el.currentTime = Math.max(0, el.currentTime - 1); }}>-1s</Button>
        <Button size="sm" variant="outline" onClick={() => { const el = v(); if (el) el.currentTime = el.currentTime + 1; }}>+1s</Button>
        <Button size="sm" variant="outline" onClick={() => { const el = v(); if (el && el.duration) el.currentTime = Math.random() * el.duration; }}>Random seek</Button>
        <Button size="sm" variant="outline" onClick={() => { const el = v(); if (el) el.muted = !el.muted; }}>Mute/Unmute</Button>
      </div>
      <input
        type="range"
        min={0}
        max={diag.duration || 0}
        step={0.05}
        value={Math.min(diag.currentTime, diag.duration || 0)}
        onChange={(e) => { const el = v(); if (el) el.currentTime = Number(e.currentTarget.value); }}
        className="block w-full"
      />
      <div className="grid grid-cols-2 gap-x-4 font-mono text-[11px] text-muted-foreground">
        <span className="col-span-2 truncate" title={src ?? ""}>src: {src ?? "(resolving...)"}</span>
        <span>time: {diag.currentTime.toFixed(2)} / {diag.duration.toFixed(2)}</span>
        <span>size: {diag.width}x{diag.height}</span>
        <span>readyState: {diag.readyState} · network: {diag.networkState}</span>
        <span>decoded frames: {diag.decodedFrames ?? "n/a"}</span>
        {diag.error && <span className="col-span-2 text-destructive">ERROR: {diag.error}</span>}
      </div>
      <div className="max-h-20 overflow-y-auto rounded bg-muted/50 p-1.5 font-mono text-[10px] leading-tight text-muted-foreground">
        {events.length ? events.map((e, i) => <div key={i}>{e}</div>) : "no events yet"}
      </div>
    </div>
  );
}

export default function VideoSpikePage() {
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [mode, setMode] = useState<SourceMode>("asset");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadVideos() {
      try {
        const urls: string[] = [];
        for (const project of await getProjects()) {
          for (const storyboard of await getStoryboards(project.id)) {
            for (const shot of await getShots(storyboard.id)) {
              if (shot.video_url) urls.push(shot.video_url);
              if (urls.length >= 3) break;
            }
            if (urls.length >= 3) break;
          }
          if (urls.length >= 3) break;
        }
        if (!cancelled) setVideoUrls(urls);
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      }
    }
    loadVideos();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">HTML5 Video Spike</h1>
          <p className="text-xs text-muted-foreground">
            WEBKIT_DISABLE_DMABUF_RENDERER=1 is set in main.rs. mpv is NOT running on this page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === "asset" ? "default" : "outline"}
            onClick={() => setMode("asset")}
          >
            asset:// src
          </Button>
          <Button
            size="sm"
            variant={mode === "blob" ? "default" : "outline"}
            onClick={() => setMode("blob")}
          >
            blob src
          </Button>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            back
          </Link>
        </div>
      </div>

      <div className="rounded border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        <p className="font-medium">Pass criteria (eyeball each):</p>
        <ol className="ml-4 list-decimal">
          <li>Video frames are VISIBLE and moving (not a black box) in both videos below</li>
          <li>The red OVERLAY TEST label renders ON TOP of the moving video</li>
          <li>Play/Pause/±1s/Random seek/slider all respond accurately, `seeked` events fire</li>
          <li>Both videos play AT THE SAME TIME without stuttering</li>
          <li>Audio is audible (unmute), and switching asset://↔blob works in both modes</li>
        </ol>
      </div>

      {loadError && <p className="text-sm text-destructive">Failed to load shots: {loadError}</p>}
      {videoUrls.length === 0 && !loadError && (
        <p className="text-sm text-muted-foreground">Looking for shot videos... (generate at least one shot video first)</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {videoUrls[0] && (
          <SpikeVideo label="Video A" assetUrl={videoUrls[0]} mode={mode} overlay />
        )}
        {videoUrls[1] && <SpikeVideo label="Video B" assetUrl={videoUrls[1]} mode={mode} />}
      </div>
      {videoUrls[2] && (
        <div className="grid grid-cols-2 gap-4">
          <SpikeVideo label="Video C (same file as A, second instance)" assetUrl={videoUrls[0]} mode={mode} />
          <SpikeVideo label="Video D" assetUrl={videoUrls[2]} mode={mode} />
        </div>
      )}
    </div>
  );
}
