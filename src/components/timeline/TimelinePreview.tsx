import { VideoPool } from "../../hooks/useVideoPool";

interface TimelinePreviewProps {
  pool: VideoPool;
  hasClips: boolean;
}

/**
 * Timeline preview surface: two stacked <video> elements managed by the
 * pool (active + preloaded). When neither is active (gap, stopped past the
 * end, or empty timeline) the black container shows through. Being plain
 * DOM, anything rendered after the videos composites on top.
 */
export default function TimelinePreview({ pool, hasClips }: TimelinePreviewProps) {
  if (!hasClips) {
    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
        <div className="text-gray-500 text-center p-8">
          <p className="text-lg font-medium">No videos available</p>
          <p className="text-sm mt-1">Generate videos in the Storyboard tab first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
      {[0, 1].map((index) => (
        <video
          key={index}
          ref={pool.videoRefs[index]}
          playsInline
          preload="auto"
          className={`absolute inset-0 h-full w-full object-contain ${
            pool.activeIndex === index ? "" : "invisible"
          }`}
        />
      ))}
    </div>
  );
}
