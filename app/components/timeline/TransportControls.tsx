import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "../../lib/timeline-utils";

interface TransportControlsProps {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  onPlay: () => void;
  onPause: () => void;
  onSkipToStart: () => void;
  onSkipToEnd: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
}

export default function TransportControls({
  isPlaying,
  currentTime,
  totalDuration,
  onPlay,
  onPause,
  onSkipToStart,
  onSkipToEnd,
  onSkipBackward,
  onSkipForward,
}: TransportControlsProps) {
  return (
    <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-lg">
      {/* Skip to Start */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onSkipToStart}
        className="h-8 w-8"
        title="Skip to start"
      >
        <SkipBack className="h-4 w-4" />
      </Button>

      {/* Skip Backward 5s */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onSkipBackward}
        className="h-8 w-8"
        title="Skip back 5 seconds"
      >
        <Rewind className="h-4 w-4" />
      </Button>

      {/* Play/Pause */}
      <Button
        onClick={isPlaying ? onPause : onPlay}
        size="icon"
        className="h-10 w-10 rounded-full"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>

      {/* Skip Forward 5s */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onSkipForward}
        className="h-8 w-8"
        title="Skip forward 5 seconds"
      >
        <FastForward className="h-4 w-4" />
      </Button>

      {/* Skip to End */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onSkipToEnd}
        className="h-8 w-8"
        title="Skip to end"
      >
        <SkipForward className="h-4 w-4" />
      </Button>

      {/* Time Display */}
      <div className="ml-3 text-foreground font-mono text-sm">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </div>
    </div>
  );
}
