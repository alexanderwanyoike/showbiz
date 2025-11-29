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
    <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
      {/* Skip to Start */}
      <button
        onClick={onSkipToStart}
        className="p-2 text-gray-400 hover:text-white transition-colors"
        title="Skip to start"
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>

      {/* Skip Backward 5s */}
      <button
        onClick={onSkipBackward}
        className="p-2 text-gray-400 hover:text-white transition-colors"
        title="Skip back 5 seconds"
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Skip Forward 5s */}
      <button
        onClick={onSkipForward}
        className="p-2 text-gray-400 hover:text-white transition-colors"
        title="Skip forward 5 seconds"
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
        </svg>
      </button>

      {/* Skip to End */}
      <button
        onClick={onSkipToEnd}
        className="p-2 text-gray-400 hover:text-white transition-colors"
        title="Skip to end"
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
        </svg>
      </button>

      {/* Time Display */}
      <div className="ml-4 text-gray-300 font-mono text-sm">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </div>
    </div>
  );
}
