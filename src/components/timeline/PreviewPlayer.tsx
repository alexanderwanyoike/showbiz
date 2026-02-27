import { TimelineClip } from "../../lib/timeline-utils";
import { VideoPool } from "../../hooks/useVideoPool";
import { cn } from "@/lib/utils";

interface PreviewPlayerProps {
  clips: TimelineClip[];
  videoPool: VideoPool;
}

export default function PreviewPlayer({ clips, videoPool }: PreviewPlayerProps) {
  if (clips.length === 0) {
    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
        <div className="text-gray-500 text-center p-8">
          <p className="text-lg font-medium">No videos available</p>
          <p className="text-sm mt-1">
            Generate videos in the Storyboard tab first
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
      {/* Video pool - render both, control visibility via opacity */}
      {([0, 1] as const).map((poolIndex) => (
        <video
          key={poolIndex}
          ref={(el) => videoPool.setVideoRef(poolIndex, el)}
          className={cn(
            "absolute inset-0 w-full h-full object-contain",
            "transition-opacity duration-150",
            poolIndex === videoPool.activeIndex
              ? "opacity-100 z-10"
              : "opacity-0 z-0"
          )}
          playsInline
        />
      ))}
    </div>
  );
}
