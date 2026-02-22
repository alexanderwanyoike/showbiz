interface TimelineRulerProps {
  totalDuration: number;
  pixelsPerSecond: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

// Determine tick intervals based on zoom level
function getTickIntervals(pixelsPerSecond: number): {
  minor: number;
  major: number;
  labelFormat: (t: number) => string;
} {
  if (pixelsPerSecond >= 150) {
    // Very zoomed in: 0.1s minor, 0.5s major
    return {
      minor: 0.1,
      major: 0.5,
      labelFormat: (t) => `${t.toFixed(1)}s`,
    };
  } else if (pixelsPerSecond >= 100) {
    // Zoomed in: 0.25s minor, 1s major
    return {
      minor: 0.25,
      major: 1,
      labelFormat: (t) => `${t.toFixed(1)}s`,
    };
  } else if (pixelsPerSecond >= 50) {
    // Normal: 0.5s minor, 2s major
    return {
      minor: 0.5,
      major: 2,
      labelFormat: (t) => `${t}s`,
    };
  } else {
    // Zoomed out: 1s minor, 5s major
    return {
      minor: 1,
      major: 5,
      labelFormat: (t) => `${t}s`,
    };
  }
}

export default function TimelineRuler({
  totalDuration,
  pixelsPerSecond,
  currentTime,
  onSeek,
}: TimelineRulerProps) {
  const totalWidth = totalDuration * pixelsPerSecond;
  const { minor, major, labelFormat } = getTickIntervals(pixelsPerSecond);

  // Generate tick marks
  const ticks: { position: number; label: string | null; isMajor: boolean }[] =
    [];

  // Generate ticks based on zoom-appropriate intervals
  for (let t = 0; t <= totalDuration + 0.001; t += minor) {
    // Round to avoid floating point issues
    const roundedT = Math.round(t * 1000) / 1000;
    const isMajor = Math.abs(roundedT % major) < 0.001 || Math.abs(roundedT % major - major) < 0.001;
    ticks.push({
      position: roundedT * pixelsPerSecond,
      label: isMajor ? labelFormat(roundedT) : null,
      isMajor,
    });
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekTime = clickX / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(totalDuration, seekTime)));
  };

  const playheadPosition = currentTime * pixelsPerSecond;

  return (
    <div
      className="relative h-6 bg-secondary cursor-pointer select-none"
      onClick={handleClick}
      style={{ width: Math.max(totalWidth, 200) }}
    >
      {/* Tick marks */}
      {ticks.map((tick, index) => (
        <div key={index} className="absolute top-0" style={{ left: tick.position }}>
          <div
            className={`w-px ${tick.isMajor ? "h-3 bg-muted-foreground" : "h-2 bg-muted-foreground/50"}`}
          />
          {tick.label && (
            <span className="absolute top-3 text-xs text-muted-foreground -translate-x-1/2">
              {tick.label}
            </span>
          )}
        </div>
      ))}

      {/* Playhead indicator */}
      <div
        className="absolute top-0 w-0.5 h-full bg-destructive pointer-events-none z-10"
        style={{ left: playheadPosition }}
      >
        {/* Playhead triangle */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-destructive" />
      </div>
    </div>
  );
}
