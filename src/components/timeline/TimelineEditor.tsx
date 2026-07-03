import { useState, useCallback, useMemo, useEffect } from "react";
import { ZoomIn, ZoomOut, Loader2, Plus, Scissors } from "lucide-react";
import type { TimelineTrack as TimelineTrackType, TimelineClipRow } from "../../lib/tauri-api";
import {
  saveAssembledVideo,
  addTimelineClip,
  removeTimelineClip,
  moveTimelineClip,
  createTimelineTrack,
  deleteTimelineTrack,
  getTimelineClips,
  getTimelineTracks,
  updateTimelineClipTrims,
  splitTimelineClip,
} from "../../lib/tauri-api";
import {
  buildTimelineClipsFromExplicit,
  getActiveClipAtTime,
  computeClipSplit,
  snapStartTime,
  orderClipsForExport,
  Shot,
  TimelineClipEntry,
} from "../../lib/timeline-utils";
import { useTimelinePlayback } from "../../hooks/useTimelinePlayback";
import { useMpvPlayer } from "../../hooks/useMpvPlayer";
import { useHtml5TimelinePlayback } from "../../hooks/useHtml5TimelinePlayback";
import { useVideoPool } from "../../hooks/useVideoPool";
import { useTrimDrag } from "../../hooks/useTrimDrag";
import { useVideoDurations } from "../../hooks/useVideoDurations";
import { videoAssembler } from "../../lib/video-assembler";
import { isElectron } from "../../lib/bridge";
import { save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import PreviewPlayer from "./PreviewPlayer";
import TimelinePreview from "./TimelinePreview";
import TransportControls from "./TransportControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TrackHeader from "./TrackHeader";

interface TimelineEditorProps {
  storyboardId: string;
  shots: Shot[];
  tracks: TimelineTrackType[];
  clipRows: TimelineClipRow[];
  /** video version id → that version's file URL */
  versionUrls: Record<string, string>;
  /** video version id → version number, for pin badges */
  versionNumbers: Record<string, number>;
  onTracksChange: (tracks: TimelineTrackType[]) => void;
  onClipsChange: (clips: TimelineClipRow[]) => void;
}

const ZOOM_LEVELS = [25, 50, 75, 100, 150, 200];
const DEFAULT_ZOOM_INDEX = 1; // 50px per second
const SNAP_PIXELS = 10; // snap radius for clip moves, in screen pixels

export default function TimelineEditor({
  storyboardId,
  shots,
  tracks,
  clipRows,
  versionUrls,
  versionNumbers,
  onTracksChange,
  onClipsChange,
}: TimelineEditorProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  // Optimistic trim values while a handle is being dragged, keyed by clip id
  const [localTrims, setLocalTrims] = useState<Record<string, { trimIn: number; trimOut: number }>>({});
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [exportStatus, setExportStatus] = useState<{ percent: number; stage: string } | null>(null);
  const electronRuntime = isElectron();

  // Convert DB clip rows (+ optimistic trims) to entries for the clip builder
  const clipEntries: TimelineClipEntry[] = useMemo(
    () =>
      clipRows.map((r) => ({
        clipId: r.id,
        shotId: r.shot_id,
        track: r.track_id,
        startTime: r.start_time,
        trimIn: localTrims[r.id]?.trimIn ?? r.trim_in,
        trimOut: localTrims[r.id]?.trimOut ?? r.trim_out,
        videoVersionId: r.video_version_id,
      })),
    [clipRows, localTrims]
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

  // Probe real durations for every URL the timeline can play: each shot's
  // current video plus any version pinned by a clip
  const durationUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const shot of shots) {
      if (shot.video_url) urls.add(shot.video_url);
    }
    for (const row of clipRows) {
      const pinned = row.video_version_id && versionUrls[row.video_version_id];
      if (pinned) urls.add(pinned);
    }
    return [...urls];
  }, [shots, clipRows, versionUrls]);
  const durations = useVideoDurations(durationUrls);

  // Build clips from entries. Memoized so the playback poll loop is not torn
  // down every render.
  const clips = useMemo(
    () => buildTimelineClipsFromExplicit(clipEntries, shots, durations, versionUrls),
    [clipEntries, shots, durations, versionUrls]
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
  const pool = useVideoPool();

  const refreshClips = useCallback(async () => {
    const updatedClips = await getTimelineClips(storyboardId);
    onClipsChange(updatedClips);
  }, [storyboardId, onClipsChange]);

  // Handle drop from media pool; a versionId pins that version to the clip
  const handleDropShot = useCallback(
    async (shotId: string, versionId: string | null, trackId: string, dropTime?: number) => {
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
        const url = versionId ? versionUrls[versionId] : shot?.video_url;
        const dropDuration = (url && durations[url]) || shot?.duration || 0;
        startTime = snapStartTime(dropTime, dropDuration, clips, SNAP_PIXELS / pixelsPerSecond);
      }

      try {
        await addTimelineClip(storyboardId, shotId, trackId, startTime, versionId);
        await refreshClips();
      } catch (error) {
        console.error("Failed to add clip:", error);
      }
    },
    [storyboardId, clips, shots, durations, versionUrls, pixelsPerSecond, refreshClips]
  );

  // Remove a clip from the timeline
  const handleRemoveClip = useCallback(
    async (clipId: string) => {
      try {
        await removeTimelineClip(clipId);
        await refreshClips();
      } catch (error) {
        console.error("Failed to remove clip:", error);
      }
    },
    [refreshClips]
  );

  // Move a clip to a new time/track
  const handleMoveClip = useCallback(
    async (clipId: string, targetTrack: string, startTime: number) => {
      const movingClip = clips.find((c) => c.clipId === clipId);
      const otherClips = clips.filter((c) => c.clipId !== clipId);
      const snapped = snapStartTime(
        Math.max(0, startTime),
        movingClip?.effectiveDuration ?? 0,
        otherClips,
        SNAP_PIXELS / pixelsPerSecond
      );

      try {
        await moveTimelineClip(clipId, targetTrack, Math.max(0, snapped));
        await refreshClips();
      } catch (error) {
        console.error("Failed to move clip:", error);
      }
    },
    [clips, pixelsPerSecond, refreshClips]
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
    const exportable = orderClipsForExport(clips).filter((c) => c.videoUrl);
    if (exportable.length === 0) {
      alert("No clips to export!");
      return;
    }

    setExportStatus({ percent: 0, stage: "Starting..." });

    try {
      const trimmedClips = exportable.map((clip) => ({
        videoUrl: clip.videoUrl!,
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

  const mpvPlayback = useTimelinePlayback({ clips, mpv });
  const html5Playback = useHtml5TimelinePlayback({ clips, pool });
  const playback = electronRuntime ? html5Playback : mpvPlayback;

  // Split the clip under the playhead (the selected one if it's there, else
  // the topmost) into two independent clips
  const handleSplit = useCallback(async () => {
    const selected = selectedClipId ? clips.find((c) => c.clipId === selectedClipId) : null;
    const target =
      (selected && computeClipSplit(selected, playback.currentTime) ? selected : null) ??
      getActiveClipAtTime(playback.currentTime, clips)?.clip;
    if (!target) return;

    const split = computeClipSplit(target, playback.currentTime);
    if (!split) return;

    try {
      await splitTimelineClip(split.clipId, split.splitLocalTime, split.secondStartTime);
      await refreshClips();
    } catch (error) {
      console.error("Failed to split clip:", error);
    }
  }, [clips, selectedClipId, playback.currentTime, refreshClips]);

  // Handle optimistic trim updates during drag
  const handleTrimChange = useCallback((clipId: string, trimIn: number, trimOut: number) => {
    setLocalTrims((prev) => ({ ...prev, [clipId]: { trimIn, trimOut } }));
  }, []);

  // Handle trim end - persist to database
  const handleTrimEnd = useCallback(
    async (clipId: string, trimIn: number, trimOut: number) => {
      try {
        await updateTimelineClipTrims(clipId, trimIn, trimOut);
        await refreshClips();
      } catch (error) {
        console.error("Failed to save trim:", error);
      } finally {
        setLocalTrims((prev) => {
          const { [clipId]: _dropped, ...rest } = prev;
          return rest;
        });
      }
    },
    [refreshClips]
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
        case "KeyS":
          e.preventDefault();
          handleSplit();
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
  }, [playback, zoomIn, zoomOut, selectedClipId, handleRemoveClip, handleSplit]);

  return (
    <div className="flex flex-col flex-1 bg-muted/50 dark:bg-card overflow-hidden">
      {/* Preview Player - Theater Mode (large but leaves room for timeline) */}
      <div className="min-h-0 px-4 py-2 flex justify-center bg-black">
        <div className="w-full max-h-[55vh]" style={{ aspectRatio: '16/9', maxWidth: 'calc(55vh * 16 / 9)' }}>
          {electronRuntime ? (
            <TimelinePreview pool={pool} hasClips={clips.length > 0} />
          ) : (
            <PreviewPlayer
              clips={clips}
              mpv={mpv}
            />
          )}
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

        {/* Edit + Export Controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSplit}
            variant="secondary"
            size="sm"
            title="Split clip at playhead (S)"
          >
            <Scissors className="h-4 w-4 mr-1.5" />
            Split
          </Button>
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
                onSeek={electronRuntime ? undefined : playback.seek}
                onScrubStart={electronRuntime ? html5Playback.beginScrub : undefined}
                onScrub={electronRuntime ? html5Playback.scrub : undefined}
                onScrubEnd={electronRuntime ? html5Playback.endScrub : undefined}
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
                        versionNumbers={versionNumbers}
                        onClipSelect={setSelectedClipId}
                        onTrimStart={(e, clipId, edge, trimIn, trimOut, maxDuration) =>
                          startTrim(e, clipId, edge, trimIn, trimOut, maxDuration)
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
          <span className="mr-4">S: Split</span>
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
