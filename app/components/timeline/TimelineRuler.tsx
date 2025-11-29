interface TimelineRulerProps {
  totalDuration: number;
  pixelsPerSecond: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function TimelineRuler({
  totalDuration,
  pixelsPerSecond,
  currentTime,
  onSeek,
}: TimelineRulerProps) {
  const totalWidth = totalDuration * pixelsPerSecond;

  // Generate tick marks
  const ticks: { position: number; label: string | null; isMajor: boolean }[] =
    [];

  // Major ticks every 5 seconds, minor ticks every 1 second
  for (let t = 0; t <= totalDuration; t += 1) {
    const isMajor = t % 5 === 0;
    ticks.push({
      position: t * pixelsPerSecond,
      label: isMajor ? `${t}s` : null,
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
      className="relative h-6 bg-gray-700 cursor-pointer select-none"
      onClick={handleClick}
      style={{ width: Math.max(totalWidth, 200) }}
    >
      {/* Tick marks */}
      {ticks.map((tick, index) => (
        <div key={index} className="absolute top-0" style={{ left: tick.position }}>
          <div
            className={`w-px ${tick.isMajor ? "h-3 bg-gray-400" : "h-2 bg-gray-500"}`}
          />
          {tick.label && (
            <span className="absolute top-3 text-xs text-gray-400 -translate-x-1/2">
              {tick.label}
            </span>
          )}
        </div>
      ))}

      {/* Playhead indicator */}
      <div
        className="absolute top-0 w-0.5 h-full bg-red-500 pointer-events-none z-10"
        style={{ left: playheadPosition }}
      >
        {/* Playhead triangle */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-red-500" />
      </div>
    </div>
  );
}
