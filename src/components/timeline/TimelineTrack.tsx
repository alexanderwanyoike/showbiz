import { useState, useRef } from "react";
import { TimelineClip as TimelineClipType } from "../../lib/timeline-utils";
import TimelineClip from "./TimelineClip";

interface TimelineTrackProps {
  trackId: string;
  trackType: "video" | "audio";
  clips: TimelineClipType[];
  pixelsPerSecond: number;
  selectedClipId: string | null;
  /** video version id → version number, for pin badges */
  versionNumbers: Record<string, number>;
  onClipSelect: (clipId: string) => void;
  onTrimStart: (
    e: React.MouseEvent,
    clipId: string,
    edge: "in" | "out",
    trimIn: number,
    trimOut: number,
    maxDuration: number
  ) => void;
  onDropShot?: (shotId: string, versionId: string | null, trackId: string, dropTime?: number) => void;
  onMoveClip?: (clipId: string, targetTrack: string, startTime: number) => void;
}

export default function TimelineTrack({
  trackId,
  trackType,
  clips,
  pixelsPerSecond,
  selectedClipId,
  versionNumbers,
  onClipSelect,
  onTrimStart,
  onDropShot,
  onMoveClip,
}: TimelineTrackProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndicatorX, setDropIndicatorX] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isAudio = trackType === "audio";
  const height = isAudio ? "h-8" : "h-12";

  const isClipMoveDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("application/x-showbiz-clip-move");

  const isShotDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("application/x-showbiz-shot");

  // Convert drop X position to timeline time in seconds
  const xToTime = (e: React.DragEvent): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + trackRef.current.scrollLeft;
    return Math.max(0, x / pixelsPerSecond);
  };

  // Calculate total width needed for absolute positioning
  const trackEndTime = clips.length > 0
    ? Math.max(...clips.map((c) => c.startOffset + c.effectiveDuration))
    : 0;
  // Minimum width: enough for all clips + some extra for dropping
  const minWidth = (trackEndTime + 2) * pixelsPerSecond;

  const handleDragOver = (e: React.DragEvent) => {
    if (!isClipMoveDrag(e) && !isShotDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isClipMoveDrag(e) ? "move" : "copy";
    setIsDragOver(true);

    // Show drop indicator at cursor position
    if (trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + trackRef.current.scrollLeft;
      setDropIndicatorX(Math.max(0, x));
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDropIndicatorX(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    setDropIndicatorX(null);

    const dropTime = xToTime(e);

    // Handle clip move
    const clipMoveData = e.dataTransfer.getData("application/x-showbiz-clip-move");
    if (clipMoveData && onMoveClip) {
      e.preventDefault();
      try {
        const { clipId, grabOffset } = JSON.parse(clipMoveData);
        const adjustedTime = Math.max(0, dropTime - (grabOffset || 0));
        onMoveClip(clipId, trackId, adjustedTime);
      } catch (error) {
        console.error("Malformed clip-move drag payload:", error);
      }
      return;
    }

    // Handle shot (or pinned version) drop from media pool
    const shotDropData = e.dataTransfer.getData("application/x-showbiz-shot");
    if (shotDropData) {
      e.preventDefault();
      try {
        const { shotId, versionId } = JSON.parse(shotDropData);
        onDropShot?.(shotId, versionId ?? null, trackId, dropTime);
      } catch (error) {
        console.error("Malformed shot drag payload:", error);
      }
    }
  };

  if (clips.length === 0) {
    return (
      <div
        ref={trackRef}
        className={`${height} bg-secondary rounded flex items-center justify-center text-muted-foreground text-sm border-2 transition-colors relative ${
          isDragOver
            ? "border-primary bg-primary/10"
            : "border-transparent"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver ? (
          <span className="text-primary font-medium">Drop to add clip</span>
        ) : (
          <span className="text-xs opacity-50">
            {isAudio ? "" : "Drag clips from media pool"}
          </span>
        )}
        {dropIndicatorX !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
            style={{ left: dropIndicatorX }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className={`${height} bg-secondary rounded overflow-x-auto border-2 transition-colors relative ${
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-transparent"
      }`}
      style={{ minWidth }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {clips.map((clip) => (
        <div
          key={clip.clipId}
          className="absolute top-0 bottom-0"
          style={{ left: clip.startOffset * pixelsPerSecond }}
        >
          <TimelineClip
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={selectedClipId === clip.clipId}
            versionNumber={clip.videoVersionId ? versionNumbers[clip.videoVersionId] : undefined}
            onClick={() => onClipSelect(clip.clipId)}
            onTrimStart={(e, edge, trimIn, trimOut, maxDuration) =>
              onTrimStart(e, clip.clipId, edge, trimIn, trimOut, maxDuration)
            }
          />
        </div>
      ))}
      {/* Drop position indicator */}
      {dropIndicatorX !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
          style={{ left: dropIndicatorX }}
        />
      )}
    </div>
  );
}
