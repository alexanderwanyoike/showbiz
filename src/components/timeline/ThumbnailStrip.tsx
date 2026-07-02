import { useState, useEffect } from "react";
import { thumbnailGenerator } from "../../lib/thumbnail-generator";

interface ThumbnailStripProps {
  videoUrl: string;
  /** Real duration of the source video in seconds */
  sourceDuration: number;
  trimIn: number;
  trimOut: number;
  width: number;
}

export default function ThumbnailStrip({
  videoUrl,
  sourceDuration,
  trimIn,
  trimOut,
  width,
}: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnails() {
      setIsLoading(true);

      // Cache by URL so clips pinned to different versions get their own frames
      const cached = thumbnailGenerator.getCachedThumbnails(videoUrl);
      if (cached) {
        if (!cancelled) {
          setThumbnails(cached);
          setIsLoading(false);
        }
        return;
      }

      try {
        const frames = await thumbnailGenerator.generateThumbnails(videoUrl);
        if (!cancelled) {
          setThumbnails(frames);
        }
      } catch (error) {
        console.error("Failed to generate thumbnails:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  // Calculate which thumbnails to show based on trim; frames are spread
  // evenly across the real source duration
  const thumbnailDuration = sourceDuration / thumbnails.length;

  // Calculate the visible portion
  const visibleThumbnails = thumbnails.filter((_, index) => {
    const thumbStart = index * thumbnailDuration;
    const thumbEnd = thumbStart + thumbnailDuration;
    // Include thumbnail if it overlaps with the trim region
    return thumbEnd > trimIn && thumbStart < trimOut;
  });

  // Calculate first visible thumbnail offset
  const firstVisibleIndex = Math.floor(trimIn / thumbnailDuration);
  const firstThumbOffset = (trimIn % thumbnailDuration) / thumbnailDuration;

  if (isLoading) {
    return (
      <div
        className="h-full bg-gray-700 animate-pulse flex items-center justify-center"
        style={{ width }}
      >
        <span className="text-xs text-gray-400">Loading...</span>
      </div>
    );
  }

  if (thumbnails.length === 0) {
    return (
      <div
        className="h-full bg-gray-600 flex items-center justify-center"
        style={{ width }}
      >
        <span className="text-xs text-gray-400">No preview</span>
      </div>
    );
  }

  return (
    <div
      className="h-full flex overflow-hidden"
      style={{ width }}
    >
      {visibleThumbnails.map((thumb, index) => {
        // Calculate width for each thumbnail slice
        const actualIndex = firstVisibleIndex + index;
        const thumbStart = actualIndex * thumbnailDuration;
        const thumbEnd = thumbStart + thumbnailDuration;

        // Clamp to trim boundaries
        const visibleStart = Math.max(thumbStart, trimIn);
        const visibleEnd = Math.min(thumbEnd, trimOut);
        const visibleDuration = visibleEnd - visibleStart;

        // Calculate the width proportionally
        const thumbWidth = (visibleDuration / (trimOut - trimIn)) * width;

        // Calculate background position offset
        const offsetRatio = (visibleStart - thumbStart) / thumbnailDuration;

        return (
          <div
            key={actualIndex}
            className="h-full flex-shrink-0 bg-cover bg-center"
            style={{
              width: thumbWidth,
              backgroundImage: `url(${thumb})`,
              backgroundPosition: `${offsetRatio * 100}% center`,
            }}
          />
        );
      })}
    </div>
  );
}
