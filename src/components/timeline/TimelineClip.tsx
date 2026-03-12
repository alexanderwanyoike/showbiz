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
}: TimelineClipProps) {
  const trimIn = clip.edit?.trim_in ?? 0;
  const trimOut = clip.edit?.trim_out ?? clip.shot.duration;
  const width = clip.effectiveDuration * pixelsPerSecond;
  const durationLabel = formatDuration(clip.effectiveDuration, pixelsPerSecond);

  const handleLeftHandleMouseDown = (e: React.MouseEvent) => {
    onTrimStart(e, "in", trimIn, trimOut, clip.shot.duration);
  };

  const handleRightHandleMouseDown = (e: React.MouseEvent) => {
    onTrimStart(e, "out", trimIn, trimOut, clip.shot.duration);
  };

  return (
    <div
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

      {/* Shot Number Overlay */}
      <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-medium">
        #{clip.shot.order}
      </div>

      {/* Duration Badge */}
      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
        {durationLabel}
      </div>

      {/* Left Trim Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-3 bg-primary/50 hover:bg-primary/80 cursor-ew-resize flex items-center justify-center group transition-colors"
        onMouseDown={handleLeftHandleMouseDown}
      >
        <div className="w-0.5 h-6 bg-white/80 group-hover:bg-white rounded-full" />
      </div>

      {/* Right Trim Handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-3 bg-primary/50 hover:bg-primary/80 cursor-ew-resize flex items-center justify-center group transition-colors"
        onMouseDown={handleRightHandleMouseDown}
      >
        <div className="w-0.5 h-6 bg-white/80 group-hover:bg-white rounded-full" />
      </div>
    </div>
  );
}
