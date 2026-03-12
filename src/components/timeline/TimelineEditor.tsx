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

  const mpv = useMpvPlayer();

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
    <div className="flex flex-col flex-1 bg-muted/50 dark:bg-card overflow-hidden">
      {/* Preview Player - Theater Mode (large but leaves room for timeline) */}
      <div className="min-h-0 px-4 py-2 flex justify-center bg-black">
        <div className="w-full max-h-[55vh]" style={{ aspectRatio: '16/9', maxWidth: 'calc(55vh * 16 / 9)' }}>
          <PreviewPlayer
            clips={clips}
            mpv={mpv}
          />
        </div>
      </div>

      {/* Transport Controls */}
      <div className="flex-shrink-0 flex items-center justify-center gap-4 py-4 border-t border-border">
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

        {/* Export Controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting || clips.length === 0}
            size="sm"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              "Export"
            )}
          </Button>
        </div>
      </div>

      {/* Timeline Area */}
      <div className="flex-1 overflow-x-auto border-t border-border p-4">
        <div className="min-w-fit">
          {/* Timeline Ruler */}
          <TimelineRuler
            totalDuration={playback.totalDuration}
            pixelsPerSecond={pixelsPerSecond}
            currentTime={playback.currentTime}
            onSeek={playback.seek}
          />

          {/* Timeline Track */}
          <div className="mt-2">
            <TimelineTrack
              clips={clips}
              pixelsPerSecond={pixelsPerSecond}
              selectedClipId={selectedClipId}
              onClipSelect={setSelectedClipId}
              onTrimStart={(e, shotId, edge, trimIn, trimOut, maxDuration) =>
                startTrim(e, shotId, edge, trimIn, trimOut, maxDuration)
              }
            />
          </div>
        </div>
      </div>

      {/* Footer with Zoom Controls and Help Text */}
      <div className="flex-shrink-0 px-4 py-2 bg-muted text-muted-foreground text-xs border-t border-border flex items-center justify-between">
        <div>
          <span className="mr-4">Space: Play/Pause</span>
          <span className="mr-4">Arrow Keys: Skip 5s</span>
          <span className="mr-4">+/-: Zoom</span>
          <span>Drag clip edges to trim</span>
        </div>

        {/* Zoom Controls */}
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
          <span className="text-foreground min-w-[60px] text-center">
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
    </div>
  );
}
