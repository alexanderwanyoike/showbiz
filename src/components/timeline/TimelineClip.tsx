import { useRef } from "react";
import { TimelineClip as TimelineClipType } from "../../lib/timeline-utils";
import ThumbnailStrip from "./ThumbnailStrip";

interface TimelineClipProps {
  clip: TimelineClipType;
  pixelsPerSecond: number;
  isSelected: boolean;
  onClick: () => void;
  onTrimStart: (
    e: React.MouseEvent,
    edge: "in" | "out",
    trimIn: number,
    trimOut: number,
    maxDuration: number
  ) => void;
  trackId: string;
}

// Format duration based on zoom level
function formatDuration(duration: number, pixelsPerSecond: number): string {
  if (pixelsPerSecond >= 150) {
    return `${duration.toFixed(2)}s`;
  } else if (pixelsPerSecond >= 75) {
    return `${duration.toFixed(1)}s`;
  } else {
    return `${Math.round(duration)}s`;
  }
}

export default function TimelineClip({
  clip,
  pixelsPerSecond,
  isSelected,
  onClick,
  onTrimStart,
  trackId,
}: TimelineClipProps) {
  const { trimIn, trimOut, sourceDuration } = clip;
  const width = clip.effectiveDuration * pixelsPerSecond;
  const durationLabel = formatDuration(clip.effectiveDuration, pixelsPerSecond);

  const handleLeftHandleMouseDown = (e: React.MouseEvent) => {
    onTrimStart(e, "in", trimIn, trimOut, sourceDuration);
  };

  const handleRightHandleMouseDown = (e: React.MouseEvent) => {
    onTrimStart(e, "out", trimIn, trimOut, sourceDuration);
  };

  const clipRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    // Calculate grab offset in seconds so the drop preserves where the user clicked
    let offsetSeconds = 0;
    if (clipRef.current) {
      const rect = clipRef.current.getBoundingClientRect();
      offsetSeconds = (e.clientX - rect.left) / pixelsPerSecond;
    }
    e.dataTransfer.setData(
      "application/x-showbiz-clip-move",
      `${clip.shot.id}:${trackId}:${offsetSeconds}`
    );
    e.dataTransfer.effectAllowed = "move";
  };

  // Prevent drag initiation from trim handles so mousedown trimming works
  const preventDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={clipRef}
      draggable
      onDragStart={handleDragStart}
      className={`relative h-full flex-shrink-0 rounded overflow-hidden cursor-pointer transition-all ${
        isSelected
          ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "hover:ring-1 hover:ring-muted-foreground"
      }`}
      style={{ width }}
      onClick={onClick}
    >
      {/* Thumbnail Strip */}
      {clip.shot.video_url && (
        <ThumbnailStrip
          videoUrl={clip.shot.video_url}
          shotId={clip.shot.id}
          trimIn={trimIn}
          trimOut={trimOut}
          width={width}
        />
      )}

      {/* Clip Name Overlay */}
      <div
        className="absolute top-1 left-4 right-4 text-white text-[10px] font-medium truncate pointer-events-none"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
      >
        Shot {clip.shot.order}
        {clip.shot.image_prompt ? ` - ${clip.shot.image_prompt}` : ""}
      </div>

      {/* Duration Badge */}
      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
        {durationLabel}
      </div>

      {/* Left Trim Handle */}
      <div
        draggable
        onDragStart={preventDrag}
        className="absolute left-0 top-0 bottom-0 w-3 bg-primary/50 hover:bg-primary/80 cursor-ew-resize flex items-center justify-center group transition-colors"
        onMouseDown={handleLeftHandleMouseDown}
      >
        <div className="w-0.5 h-6 bg-white/80 group-hover:bg-white rounded-full" />
      </div>

      {/* Right Trim Handle */}
      <div
        draggable
        onDragStart={preventDrag}
        className="absolute right-0 top-0 bottom-0 w-3 bg-primary/50 hover:bg-primary/80 cursor-ew-resize flex items-center justify-center group transition-colors"
        onMouseDown={handleRightHandleMouseDown}
      >
        <div className="w-0.5 h-6 bg-white/80 group-hover:bg-white rounded-full" />
      </div>
    </div>
  );
}
