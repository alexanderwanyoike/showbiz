"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { TimelineEdit } from "../../lib/data/timeline-edits";
import {
  buildTimelineClips,
  Shot,
  TimelineClip,
} from "../../lib/timeline-utils";
import { useTimelinePlayback } from "../../hooks/useTimelinePlayback";
import { useTrimDrag } from "../../hooks/useTrimDrag";
import { updateTimelineEdit } from "../../actions/timeline-actions";
import PreviewPlayer from "./PreviewPlayer";
import TransportControls from "./TransportControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";

interface TimelineEditorProps {
  storyboardId: string;
  shots: Shot[];
  edits: TimelineEdit[];
  onEditsChange: (edits: TimelineEdit[]) => void;
}

const PIXELS_PER_SECOND = 50;

export default function TimelineEditor({
  storyboardId,
  shots,
  edits,
  onEditsChange,
}: TimelineEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<TimelineEdit[]>(edits);

  // Sync local edits with props
  useEffect(() => {
    setLocalEdits(edits);
  }, [edits]);

  // Build clips from shots and edits
  const clips = buildTimelineClips(shots, localEdits);

  // Playback hook
  const playback = useTimelinePlayback({
    clips,
    videoRef,
  });

  // Handle optimistic trim updates during drag
  const handleTrimChange = useCallback(
    (shotId: string, trimIn: number, trimOut: number) => {
      setLocalEdits((prev) => {
        const existing = prev.find((e) => e.shot_id === shotId);
        if (existing) {
          return prev.map((e) =>
            e.shot_id === shotId ? { ...e, trim_in: trimIn, trim_out: trimOut } : e
          );
        }
        // Create a temporary edit
        return [
          ...prev,
          {
            id: `temp-${shotId}`,
            storyboard_id: storyboardId,
            shot_id: shotId,
            trim_in: trimIn,
            trim_out: trimOut,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });
    },
    [storyboardId]
  );

  // Handle trim end - persist to database
  const handleTrimEnd = useCallback(
    async (shotId: string, trimIn: number, trimOut: number) => {
      try {
        const updatedEdit = await updateTimelineEdit(
          storyboardId,
          shotId,
          trimIn,
          trimOut
        );
        // Update local state with persisted edit
        setLocalEdits((prev) => {
          const existing = prev.find((e) => e.shot_id === shotId);
          if (existing) {
            return prev.map((e) => (e.shot_id === shotId ? updatedEdit : e));
          }
          return [...prev, updatedEdit];
        });
        // Notify parent
        onEditsChange(
          localEdits.map((e) => (e.shot_id === shotId ? updatedEdit : e))
        );
      } catch (error) {
        console.error("Failed to save trim:", error);
        // Revert to original edits on error
        setLocalEdits(edits);
      }
    },
    [storyboardId, edits, localEdits, onEditsChange]
  );

  // Trim drag hook
  const { startTrim } = useTrimDrag({
    pixelsPerSecond: PIXELS_PER_SECOND,
    onTrimChange: handleTrimChange,
    onTrimEnd: handleTrimEnd,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (playback.isPlaying) {
            playback.pause();
          } else {
            playback.play();
          }
          break;
        case "Home":
          e.preventDefault();
          playback.skipToStart();
          break;
        case "End":
          e.preventDefault();
          playback.skipToEnd();
          break;
        case "ArrowLeft":
          e.preventDefault();
          playback.skipBackward();
          break;
        case "ArrowRight":
          e.preventDefault();
          playback.skipForward();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback]);

  return (
    <div className="flex flex-col flex-1 bg-gray-900 overflow-hidden">
      {/* Preview Player */}
      <div className="flex-shrink-0 p-4">
        <div className="max-w-2xl mx-auto">
          <PreviewPlayer
            ref={videoRef}
            clips={clips}
            currentClipIndex={playback.currentClipIndex}
          />
        </div>
      </div>

      {/* Transport Controls */}
      <div className="flex-shrink-0 flex justify-center py-4 border-t border-gray-700">
        <TransportControls
          isPlaying={playback.isPlaying}
          currentTime={playback.currentTime}
          totalDuration={playback.totalDuration}
          onPlay={playback.play}
          onPause={playback.pause}
          onSkipToStart={playback.skipToStart}
          onSkipToEnd={playback.skipToEnd}
          onSkipBackward={playback.skipBackward}
          onSkipForward={playback.skipForward}
        />
      </div>

      {/* Timeline Area */}
      <div className="flex-1 overflow-x-auto border-t border-gray-700 p-4">
        <div className="min-w-fit">
          {/* Timeline Ruler */}
          <TimelineRuler
            totalDuration={playback.totalDuration}
            pixelsPerSecond={PIXELS_PER_SECOND}
            currentTime={playback.currentTime}
            onSeek={playback.seek}
          />

          {/* Timeline Track */}
          <div className="mt-2">
            <TimelineTrack
              clips={clips}
              pixelsPerSecond={PIXELS_PER_SECOND}
              selectedClipId={selectedClipId}
              onClipSelect={setSelectedClipId}
              onTrimStart={(e, shotId, edge, trimIn, trimOut) =>
                startTrim(e, shotId, edge, trimIn, trimOut)
              }
            />
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className="flex-shrink-0 px-4 py-2 bg-gray-800 text-gray-400 text-xs border-t border-gray-700">
        <span className="mr-4">Space: Play/Pause</span>
        <span className="mr-4">Arrow Keys: Skip 5s</span>
        <span>Drag clip edges to trim</span>
      </div>
    </div>
  );
}
