import { TimelineClip as TimelineClipType } from "../../lib/timeline-utils";
import TimelineClip from "./TimelineClip";

interface TimelineTrackProps {
  clips: TimelineClipType[];
  pixelsPerSecond: number;
  selectedClipId: string | null;
  onClipSelect: (shotId: string) => void;
  onTrimStart: (
    e: React.MouseEvent,
    shotId: string,
    edge: "in" | "out",
    trimIn: number,
    trimOut: number
  ) => void;
}

export default function TimelineTrack({
  clips,
  pixelsPerSecond,
  selectedClipId,
  onClipSelect,
  onTrimStart,
}: TimelineTrackProps) {
  if (clips.length === 0) {
    return (
      <div className="h-12 bg-secondary rounded flex items-center justify-center text-muted-foreground text-sm">
        No completed videos to edit. Generate videos in the Storyboard tab first.
      </div>
    );
  }

  return (
    <div className="h-12 bg-secondary rounded flex gap-0.5 overflow-x-auto">
      {clips.map((clip) => (
        <TimelineClip
          key={clip.shot.id}
          clip={clip}
          pixelsPerSecond={pixelsPerSecond}
          isSelected={selectedClipId === clip.shot.id}
          onClick={() => onClipSelect(clip.shot.id)}
          onTrimStart={(e, edge, trimIn, trimOut) =>
            onTrimStart(e, clip.shot.id, edge, trimIn, trimOut)
          }
        />
      ))}
    </div>
  );
}
