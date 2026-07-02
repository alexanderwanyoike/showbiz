import { useState, useEffect, useCallback, useMemo } from "react";
import { ZoomIn, ZoomOut, Loader2, Plus } from "lucide-react";
import type { TimelineEdit, TimelineTrack as TimelineTrackType, TimelineClipRow } from "../../lib/tauri-api";
import {
  updateTimelineEdit,
  saveAssembledVideo,
  addTimelineClip,
  removeTimelineClip,
  moveTimelineClip,
  createTimelineTrack,
  deleteTimelineTrack,
  getTimelineClips,
  getTimelineTracks,
} from "../../lib/tauri-api";
import {
  buildTimelineClipsFromExplicit,
  snapStartTime,
  orderClipsForExport,
  Shot,
  TimelineClipEntry,
} from "../../lib/timeline-utils";
import { useTimelinePlayback } from "../../hooks/useTimelinePlayback";
import { useMpvPlayer } from "../../hooks/useMpvPlayer";
import { useTrimDrag } from "../../hooks/useTrimDrag";
import { useVideoDurations } from "../../hooks/useVideoDurations";
import { videoAssembler } from "../../lib/video-assembler";
import { save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import PreviewPlayer from "./PreviewPlayer";
import TransportControls from "./TransportControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TrackHeader from "./TrackHeader";

interface TimelineEditorProps {
  storyboardId: string;
  shots: Shot[];
  edits: TimelineEdit[];
  onEditsChange: (edits: TimelineEdit[]) => void;
  tracks: TimelineTrackType[];
  clipRows: TimelineClipRow[];
  onTracksChange: (tracks: TimelineTrackType[]) => void;
  onClipsChange: (clips: TimelineClipRow[]) => void;
}

const ZOOM_LEVELS = [25, 50, 75, 100, 150, 200];
const DEFAULT_ZOOM_INDEX = 1; // 50px per second
const SNAP_PIXELS = 10; // snap radius for clip moves, in screen pixels

export default function TimelineEditor({
  storyboardId,
  shots,
  edits,
  onEditsChange,
  tracks,
  clipRows,
  onTracksChange,
  onClipsChange,
}: TimelineEditorProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<TimelineEdit[]>(edits);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [exportStatus, setExportStatus] = useState<{ percent: number; stage: string } | null>(null);

  // Convert DB clip rows to TimelineClipEntry for the clip builder
  const clipEntries: TimelineClipEntry[] = useMemo(
    () => clipRows.map((r) => ({ shotId: r.shot_id, track: r.track_id, startTime: r.start_time })),
    [clipRows]
  );

  // Sort tracks: video tracks (descending by track_id), then audio tracks (ascending)
  const sortedTracks = useMemo(() => {
    const videoTracks = tracks.filter((t) => t.track_type === "video").sort((a, b) => b.position - a.position);
    const audioTracks = tracks.filter((t) => t.track_type === "audio").sort((a, b) => a.position - b.position);
    return [...videoTracks, ...audioTracks];
  }, [tracks]);

  const videoTrackCount = useMemo(() => tracks.filter((t) => t.track_type === "video").length, [tracks]);

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

  // Real video durations probed from the files (shot.duration is stale)
  const durations = useVideoDurations(shots);

  // Build clips from explicit entries (empty timeline by default).
  // Memoized so the playback poll loop is not torn down every render.
  const clips = useMemo(
    () => buildTimelineClipsFromExplicit(clipEntries, shots, localEdits, durations),
    [clipEntries, shots, localEdits, durations]
  );

  // Group clips by track
  const clipsByTrack = useMemo(() => {
    const byTrack = new Map<string, typeof clips>();
    for (const clip of clips) {
      const trackId = clip.track;
      if (!byTrack.has(trackId)) {
        byTrack.set(trackId, []);
      }
      byTrack.get(trackId)!.push(clip);
    }
    return byTrack;
  }, [clips]);

  const mpv = useMpvPlayer();

  // Handle drop from media pool — append at end of track content
  const handleDropShot = useCallback(
    async (shotId: string, trackId: string, dropTime?: number) => {
      // Don't add if already on this track
      const alreadyOnTrack = clipRows.some(
        (r) => r.shot_id === shotId && r.track_id === trackId
      );
      if (alreadyOnTrack) return;

      // Calculate start time: use dropTime if provided, else append after last clip on track
      let startTime = dropTime ?? 0;
      if (dropTime === undefined) {
        const trackClips = clips.filter((c) => c.track === trackId);
        if (trackClips.length > 0) {
          startTime = Math.max(
            ...trackClips.map((c) => c.startOffset + c.effectiveDuration)
          );
        }
      } else {
        const shot = shots.find((s) => s.id === shotId);
        const dropDuration = durations[shotId] ?? shot?.duration ?? 0;
        startTime = snapStartTime(dropTime, dropDuration, clips, SNAP_PIXELS / pixelsPerSecond);
      }

      try {
        await addTimelineClip(storyboardId, shotId, trackId, startTime);
        const updatedClips = await getTimelineClips(storyboardId);
        onClipsChange(updatedClips);
      } catch (error) {
        console.error("Failed to add clip:", error);
      }
    },
    [storyboardId, clipRows, clips, shots, durations, pixelsPerSecond, onClipsChange]
  );

  // Remove a clip from the timeline
  const handleRemoveClip = useCallback(
    async (shotId: string) => {
      const clipRow = clipRows.find((r) => r.shot_id === shotId);
      if (!clipRow) return;

      try {
        await removeTimelineClip(clipRow.id);
        const updatedClips = await getTimelineClips(storyboardId);
        onClipsChange(updatedClips);
      } catch (error) {
        console.error("Failed to remove clip:", error);
      }
    },
    [storyboardId, clipRows, onClipsChange]
  );

  // Move a clip to a new time/track
  const handleMoveClip = useCallback(
    async (shotId: string, sourceTrack: string, targetTrack: string, startTime: number) => {
      // Find the clip row by shotId + sourceTrack
      const clipRow = clipRows.find(
        (r) => r.shot_id === shotId && r.track_id === sourceTrack
      );
      if (!clipRow) return;

      const movingClip = clips.find(
        (c) => c.shot.id === shotId && c.track === sourceTrack
      );
      const otherClips = clips.filter(
        (c) => !(c.shot.id === shotId && c.track === sourceTrack)
      );
      const snapped = snapStartTime(
        Math.max(0, startTime),
        movingClip?.effectiveDuration ?? 0,
        otherClips,
        SNAP_PIXELS / pixelsPerSecond
      );

      try {
        await moveTimelineClip(clipRow.id, targetTrack, Math.max(0, snapped));
        const updatedClips = await getTimelineClips(storyboardId);
        onClipsChange(updatedClips);
      } catch (error) {
        console.error("Failed to move clip:", error);
      }
    },
    [storyboardId, clipRows, clips, pixelsPerSecond, onClipsChange]
  );

  // Add a new track
  const handleAddTrack = useCallback(
    async (trackType: "video" | "audio") => {
      try {
        await createTimelineTrack(storyboardId, trackType);
        const updatedTracks = await getTimelineTracks(storyboardId);
        onTracksChange(updatedTracks);
      } catch (error) {
        console.error("Failed to add track:", error);
      }
    },
    [storyboardId, onTracksChange]
  );

  // Remove a track
  const handleRemoveTrack = useCallback(
    async (trackDbId: string) => {
      try {
        await deleteTimelineTrack(trackDbId);
        const [updatedTracks, updatedClips] = await Promise.all([
          getTimelineTracks(storyboardId),
          getTimelineClips(storyboardId),
        ]);
        onTracksChange(updatedTracks);
        onClipsChange(updatedClips);
      } catch (error) {
        console.error("Failed to remove track:", error);
      }
    },
    [storyboardId, onTracksChange, onClipsChange]
  );

  const handleExport = useCallback(async () => {
    if (clips.length === 0) {
      alert("No clips to export!");
      return;
    }

    setExportStatus({ percent: 0, stage: "Starting..." });

    try {
      const trimmedClips = orderClipsForExport(clips).map((clip) => ({
        videoUrl: clip.shot.video_url!,
        trimIn: clip.trimIn,
        trimOut: clip.trimOut,
      }));

      const videoBytes = await videoAssembler.assembleTrimmedVideos(
        trimmedClips,
        (percent, stage) => setExportStatus({ percent, stage })
      );

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
      setExportStatus(null);
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
          playback.seek(playback.currentTime - (e.shiftKey ? 1 : 0.1));
          break;
        case "ArrowRight":
          e.preventDefault();
          playback.seek(playback.currentTime + (e.shiftKey ? 1 : 0.1));
          break;
        case "KeyJ":
          e.preventDefault();
          playback.skipBackward();
          break;
        case "KeyK":
          e.preventDefault();
          playback.pause();
          break;
        case "KeyL":
          e.preventDefault();
          playback.play();
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
        case "Delete":
        case "Backspace":
          if (selectedClipId) {
            e.preventDefault();
            handleRemoveClip(selectedClipId);
            setSelectedClipId(null);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback, zoomIn, zoomOut, selectedClipId, handleRemoveClip]);

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
            disabled={exportStatus !== null || clips.length === 0}
            size="sm"
          >
            {exportStatus !== null ? (
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
      <div className="flex-1 border-t border-border flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Track Headers (fixed left column) */}
          <div className="flex-shrink-0 flex flex-col">
            {/* Spacer for ruler height */}
            <div className="h-6 bg-muted/80 border-r border-border" />
            {/* Track headers */}
            {sortedTracks.map((track, idx) => {
              const isLastVideoBeforeAudio =
                track.track_type === "video" &&
                (idx === sortedTracks.length - 1 || sortedTracks[idx + 1]?.track_type === "audio");
              const isLastAudio =
                track.track_type === "audio" && idx === sortedTracks.length - 1;

              return (
                <div key={track.id}>
                  <div className={`mt-0.5 ${track.track_type === "audio" ? "h-8" : "h-12"}`}>
                    <TrackHeader
                      name={track.name}
                      type={track.track_type}
                      onRemove={() => handleRemoveTrack(track.id)}
                      canRemove={track.track_type === "video" ? videoTrackCount > 1 : true}
                    />
                  </div>
                  {isLastVideoBeforeAudio && (
                    <div className="flex justify-center py-0.5 bg-muted/80 border-r border-border">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleAddTrack("video")}
                        title="Add video track"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {isLastAudio && (
                    <div className="flex justify-center py-0.5 bg-muted/80 border-r border-border">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleAddTrack("audio")}
                        title="Add audio track"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scrollable timeline content */}
          <div className="flex-1 overflow-x-auto p-4">
            <div className="min-w-fit">
              {/* Timeline Ruler */}
              <TimelineRuler
                totalDuration={playback.totalDuration}
                pixelsPerSecond={pixelsPerSecond}
                currentTime={playback.currentTime}
                onSeek={playback.seek}
              />

              {/* Timeline Tracks */}
              {sortedTracks.map((track, idx) => {
                const isLastVideoBeforeAudio =
                  track.track_type === "video" &&
                  (idx === sortedTracks.length - 1 || sortedTracks[idx + 1]?.track_type === "audio");
                const isLastAudio =
                  track.track_type === "audio" && idx === sortedTracks.length - 1;

                return (
                  <div key={track.id}>
                    <div className="mt-0.5">
                      <TimelineTrack
                        trackId={track.track_id}
                        trackType={track.track_type}
                        clips={clipsByTrack.get(track.track_id) || []}
                        pixelsPerSecond={pixelsPerSecond}
                        selectedClipId={selectedClipId}
                        onClipSelect={setSelectedClipId}
                        onTrimStart={(e, shotId, edge, trimIn, trimOut, maxDuration) =>
                          startTrim(e, shotId, edge, trimIn, trimOut, maxDuration)
                        }
                        onDropShot={handleDropShot}
                        onMoveClip={handleMoveClip}
                      />
                    </div>
                    {/* Spacer rows matching the add-track buttons in header column */}
                    {(isLastVideoBeforeAudio || isLastAudio) && (
                      <div className="h-[28px]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex-shrink-0 px-4 py-1 bg-muted/80 border-t border-border flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {exportStatus ? (
            <>
              <div className="max-w-[300px] w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${exportStatus.percent}%` }}
                />
              </div>
              <span className="whitespace-nowrap">{exportStatus.stage} — {Math.round(exportStatus.percent)}%</span>
            </>
          ) : (
            <span>{clips.length} clip{clips.length !== 1 ? "s" : ""} on timeline</span>
          )}
        </div>
      </div>

      {/* Footer with Zoom Controls and Help Text */}
      <div className="flex-shrink-0 px-4 py-2 bg-muted text-muted-foreground text-xs border-t border-border flex items-center justify-between">
        <div>
          <span className="mr-4">Space: Play/Pause</span>
          <span className="mr-4">J/K/L: Back 5s/Pause/Play</span>
          <span className="mr-4">Arrows: Step 0.1s (Shift: 1s)</span>
          <span className="mr-4">+/-: Zoom</span>
          <span className="mr-4">Del: Remove clip</span>
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
