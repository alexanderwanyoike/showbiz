import { forwardRef } from "react";
import { TimelineClip } from "../../lib/timeline-utils";

interface PreviewPlayerProps {
  clips: TimelineClip[];
  currentClipIndex: number;
}

const PreviewPlayer = forwardRef<HTMLVideoElement, PreviewPlayerProps>(
  function PreviewPlayer({ clips, currentClipIndex }, ref) {
    const currentClip = clips[currentClipIndex];

    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
        {clips.length === 0 ? (
          <div className="text-gray-500 text-center p-8">
            <p className="text-lg font-medium">No videos available</p>
            <p className="text-sm mt-1">
              Generate videos in the Storyboard tab first
            </p>
          </div>
        ) : (
          <video
            ref={ref}
            className="w-full h-full object-contain"
            src={currentClip?.shot.video_url || undefined}
            playsInline
          />
        )}
      </div>
    );
  }
);

export default PreviewPlayer;
