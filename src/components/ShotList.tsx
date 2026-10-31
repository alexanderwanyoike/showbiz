import { useEffect, useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { thumbnailGenerator } from "../lib/thumbnail-generator";
import { resolvePreviewStill } from "../lib/video-preview";

export interface ShotListItem {
  id: string;
  order: number;
  image_prompt: string | null;
  video_prompt: string | null;
  image_url: string | null;
  video_url: string | null;
  status: "pending" | "generating" | "complete" | "failed";
}

interface ShotListProps {
  shots: ShotListItem[];
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onAddShot: () => void;
  onMoveShot: (index: number, direction: "up" | "down") => void;
  onDeleteShot: (shotId: string) => void;
}

function truncatePrompt(prompt: string | null): string {
  if (!prompt) return "No prompt";
  if (prompt.length <= 40) return prompt;
  return prompt.slice(0, 40) + "...";
}

function shotListPrompt(shot: ShotListItem): string | null {
  return shot.video_prompt || shot.image_prompt;
}

export default function ShotList({
  shots,
  selectedShotId,
  onSelectShot,
  onAddShot,
  onMoveShot,
  onDeleteShot,
}: ShotListProps) {
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    for (const shot of shots) {
      if (shot.image_url || !shot.video_url || Object.hasOwn(posters, shot.video_url)) continue;
      const videoUrl = shot.video_url;
      thumbnailGenerator
        .extractFrame(videoUrl, 0)
        .then((frame) => {
          if (!cancelled) setPosters((prev) => ({ ...prev, [videoUrl]: frame }));
        })
        .catch((error: unknown) => {
          console.warn("Could not prepare a shot preview:", error);
          if (!cancelled) setPosters((prev) => ({ ...prev, [videoUrl]: "" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [shots, posters]);

  return (
    <section aria-label="Shots" className="shot-browser">
      <div className="shot-browser-heading">
        <span>Shots</span>
        <span>{shots.length}</span>
      </div>
      <ol className="shot-browser-list">
        {shots.map((shot, index) => {
          const previewStill = resolvePreviewStill(
            shot.image_url,
            posters[shot.video_url ?? ""],
          );
          const status =
            shot.status === "generating"
              ? "Generating"
              : shot.status === "failed"
                ? "Failed"
                : shot.video_url
                  ? "Video ready"
                  : shot.image_url
                    ? "Frame ready"
                    : "No media";
          return (
            <li
              key={shot.id}
              className={`shot-browser-row group ${selectedShotId === shot.id ? "is-selected" : ""}`}
            >
              <button
                className="shot-browser-select"
                aria-label={`Select shot ${shot.order}`}
                aria-pressed={selectedShotId === shot.id}
                onClick={() => onSelectShot(shot.id)}
              >
                <span className="shot-browser-thumbnail">
                  {previewStill ? (
                    <img src={previewStill} alt="" />
                  ) : (
                    <span>{String(shot.order).padStart(2, "0")}</span>
                  )}
                </span>
                <span className="shot-browser-copy">
                  <strong>Shot {String(shot.order).padStart(2, "0")}</strong>
                  <span>{truncatePrompt(shotListPrompt(shot))}</span>
                  <small>
                    {shot.status === "generating" && (
                      <Loader2 size={10} className="animate-spin" />
                    )}
                    {status}
                  </small>
                </span>
              </button>
              <div className="shot-browser-actions">
                <button
                  aria-label={`Move shot ${shot.order} up`}
                  title="Move earlier"
                  disabled={index === 0}
                  onClick={() => onMoveShot(index, "up")}
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  aria-label={`Move shot ${shot.order} down`}
                  title="Move later"
                  disabled={index === shots.length - 1}
                  onClick={() => onMoveShot(index, "down")}
                >
                  <ChevronRight size={12} />
                </button>
                <button
                  aria-label={`Delete shot ${shot.order}`}
                  title="Delete shot"
                  onClick={() => onDeleteShot(shot.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button onClick={onAddShot} className="shot-browser-add">
        <Plus size={13} />
        Add shot
      </button>
    </section>
  );
}
