import { useState, useEffect, useCallback } from "react";
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { TimelineEdit } from "../../lib/tauri-api";
import { updateTimelineEdit, saveAssembledVideo } from "../../lib/tauri-api";
import {
  buildTimelineClips,
  Shot,
} from "../../lib/timeline-utils";
import { useTimelinePlayback } from "../../hooks/useTimelinePlayback";
import { useMpvPlayer } from "../../hooks/useMpvPlayer";
import { useTrimDrag } from "../../hooks/useTrimDrag";
import { videoAssembler } from "../../lib/video-assembler";
import { save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import PreviewPlayer from "./PreviewPlayer";
import TransportControls from "./TransportControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import { getSelectedClipId, getSelectedClipSummary } from "../../lib/timeline-workspace";

interface TimelineEditorProps {
  storyboardId: string;
  shots: Shot[];
  edits: TimelineEdit[];
  onEditsChange: (edits: TimelineEdit[]) => void;
}

const ZOOM_LEVELS = [25, 50, 75, 100, 150, 200];
const DEFAULT_ZOOM_INDEX = 1; // 50px per second

export default function TimelineEditor({
  storyboardId,
  shots,
  edits,
  onEditsChange,
}: TimelineEditorProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<TimelineEdit[]>(edits);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [isExporting, setIsExporting] = useState(false);

  const pixelsPerSecond = ZOOM_LEVELS[zoomIndex];

  const zoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // Sync local edits with props
  useEffect(() => {
    setLocalEdits(edits);
  }, [edits]);

  // Build clips from shots and edits
  const clips = buildTimelineClips(shots, localEdits);
  const resolvedSelectedClipId = getSelectedClipId(clips, selectedClipId);
  const selectedClip = clips.find((clip) => clip.shot.id === resolvedSelectedClipId) ?? null;
  const selectedClipSummary = selectedClip ? getSelectedClipSummary(selectedClip) : null;

  const mpv = useMpvPlayer();

  useEffect(() => {
    if (resolvedSelectedClipId !== selectedClipId) {
      setSelectedClipId(resolvedSelectedClipId);
    }
  }, [resolvedSelectedClipId, selectedClipId]);

  const handleExport = useCallback(async () => {
    if (clips.length === 0) {
      alert("No clips to export!");
      return;
    }

    setIsExporting(true);

    try {
      const trimmedClips = clips.map((clip) => ({
        videoUrl: clip.shot.video_url!,
        trimIn: clip.edit?.trim_in ?? 0,
        trimOut: clip.edit?.trim_out ?? clip.shot.duration,
      }));

      const videoBytes = await videoAssembler.assembleTrimmedVideos(trimmedClips);

      // Show save dialog
      const savePath = await save({
        defaultPath: "edited-video.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });

      if (savePath) {
        await saveAssembledVideo(Array.from(videoBytes), savePath);
        alert("Video exported successfully!");
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export video. Check console for details.");
    } finally {
      setIsExporting(false);
    }
  }, [clips]);

  const playback = useTimelinePlayback({ clips, mpv });

  // Handle optimistic trim updates during drag
  const handleTrimChange = useCallback(
    (shotId: string, trimIn: number, trimOut: number) => {
      setLocalEdits((prev) => {
        const existing = prev.find((e) => e.shot_id === shotId);
        if (existing) {
          return prev.map((e) =>
            e.shot_id === shotId ? { ...e, trim_in: trimIn, trim_out: trimOut } : e
          );
        }
        // Create a temporary edit
        return [
          ...prev,
          {
            id: `temp-${shotId}`,
            storyboard_id: storyboardId,
            shot_id: shotId,
            trim_in: trimIn,
            trim_out: trimOut,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });
    },
    [storyboardId]
  );

  // Handle trim end - persist to database
  const handleTrimEnd = useCallback(
    async (shotId: string, trimIn: number, trimOut: number) => {
      try {
        const updatedEdit = await updateTimelineEdit(
          storyboardId,
          shotId,
          trimIn,
          trimOut
        );
        // Update local state with persisted edit
        setLocalEdits((prev) => {
          const existing = prev.find((e) => e.shot_id === shotId);
          if (existing) {
            return prev.map((e) => (e.shot_id === shotId ? updatedEdit : e));
          }
          return [...prev, updatedEdit];
        });
        // Notify parent
        onEditsChange(
          localEdits.map((e) => (e.shot_id === shotId ? updatedEdit : e))
        );
      } catch (error) {
        console.error("Failed to save trim:", error);
        // Revert to original edits on error
        setLocalEdits(edits);
      }
    },
    [storyboardId, edits, localEdits, onEditsChange]
  );

  // Trim drag hook
  const { startTrim } = useTrimDrag({
    pixelsPerSecond,
    onTrimChange: handleTrimChange,
    onTrimEnd: handleTrimEnd,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (playback.isPlaying) {
            playback.pause();
          } else {
            playback.play();
          }
          break;
        case "Home":
          e.preventDefault();
          playback.skipToStart();
          break;
        case "End":
          e.preventDefault();
          playback.skipToEnd();
          break;
        case "ArrowLeft":
          e.preventDefault();
          playback.skipBackward();
          break;
        case "ArrowRight":
          e.preventDefault();
          playback.skipForward();
          break;
        case "Equal":
        case "NumpadAdd":
          e.preventDefault();
          zoomIn();
          break;
        case "Minus":
        case "NumpadSubtract":
          e.preventDefault();
          zoomOut();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback, zoomIn, zoomOut]);

  return (
    <div className="flex flex-1 overflow-hidden rounded-xl border border-border/70 bg-card/60">
      <aside className="hidden w-72 flex-col border-r border-border/70 bg-card/70 xl:flex">
        <div className="border-b border-border/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sequence Bin
          </p>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {clips.map((clip) => (
            <button
              key={clip.shot.id}
              onClick={() => setSelectedClipId(clip.shot.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                clip.shot.id === resolvedSelectedClipId
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/70 bg-background/70 hover:bg-secondary/70"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-16 overflow-hidden rounded-md border border-border/70 bg-muted">
                  {clip.shot.image_url ? (
                    <img
                      src={clip.shot.image_url}
                      alt={`Shot ${clip.shot.order}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <span className="text-xs">#{clip.shot.order}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Shot {clip.shot.order}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {clip.effectiveDuration.toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {clip.shot.video_prompt || "No video prompt"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Timeline Monitor
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-background/60">
          <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 px-4 py-4">
                <div className="flex h-full items-center justify-center rounded-xl border border-border/70 bg-black p-4">
                  <div className="w-full max-h-[55vh]" style={{ aspectRatio: "16/9", maxWidth: "calc(55vh * 16 / 9)" }}>
                    <PreviewPlayer
                      clips={clips}
                      mpv={mpv}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border/70 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <TransportControls
                    isPlaying={playback.isPlaying}
                    currentTime={playback.currentTime}
                    totalDuration={playback.totalDuration}
                    onPlay={playback.play}
                    onPause={playback.pause}
                    onSkipToStart={playback.skipToStart}
                    onSkipToEnd={playback.skipToEnd}
                    onSkipBackward={playback.skipBackward}
                    onSkipForward={playback.skipForward}
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleExport}
                      disabled={isExporting || clips.length === 0}
                      size="sm"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        "Export"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="hidden border-l border-border/70 bg-card/70 xl:flex xl:flex-col">
              <div className="border-b border-border/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Clip Inspector
                </p>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {selectedClip && selectedClipSummary ? (
                  <>
                    <section className="space-y-3 border-b border-border/70 pb-4">
                      <h3 className="text-base font-semibold text-foreground">
                        Shot {selectedClipSummary.shotNumber}
                      </h3>
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>Source duration</span>
                          <span className="text-foreground">
                            {selectedClipSummary.sourceDuration.toFixed(1)}s
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Timeline duration</span>
                          <span className="text-foreground">
                            {selectedClipSummary.effectiveDuration.toFixed(1)}s
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Trim in</span>
                          <span className="text-foreground">
                            {selectedClipSummary.trimIn.toFixed(1)}s
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Trim out</span>
                          <span className="text-foreground">
                            {selectedClipSummary.trimOut.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-3 border-b border-border/70 pb-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Source Prompt
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {selectedClip.shot.video_prompt || "No video prompt saved for this shot."}
                      </p>
                    </section>

                    <section className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Timeline Controls
                      </p>
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>Use the clip edges to trim timing directly in the timeline.</div>
                        <div>Use space to play or pause and arrow keys to navigate.</div>
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Select a clip to inspect trim and duration details.
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>

        <div className="border-t border-border/70 bg-card/70 p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              <span className="mr-4">Space: Play/Pause</span>
              <span className="mr-4">Arrow Keys: Skip 5s</span>
              <span>Drag clip edges to trim</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={zoomOut}
                disabled={zoomIndex === 0}
                className="h-7 w-7"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="min-w-[60px] text-center text-foreground">
                {pixelsPerSecond}px/s
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={zoomIn}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className="h-7 w-7"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-fit">
              <TimelineRuler
                totalDuration={playback.totalDuration}
                pixelsPerSecond={pixelsPerSecond}
                currentTime={playback.currentTime}
                onSeek={playback.seek}
              />

              <div className="mt-2">
                <TimelineTrack
                  clips={clips}
                  pixelsPerSecond={pixelsPerSecond}
                  selectedClipId={resolvedSelectedClipId}
                  onClipSelect={setSelectedClipId}
                  onTrimStart={(e, shotId, edge, trimIn, trimOut, maxDuration) =>
                    startTrim(e, shotId, edge, trimIn, trimOut, maxDuration)
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
