import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceCommand } from "./WorkspaceCommand";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Plus,
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Loader2,
} from "lucide-react";
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
  generationPending?: boolean;
}

interface ShotListProps {
  shots: ShotListItem[];
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onAddShot: () => void;
  onMoveShot: (index: number, direction: "up" | "down") => void;
  onDeleteShot: (shotId: string, restoreFocus?: () => void) => void;
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
  const shotButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const actionButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  function navigateShot(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next = index;
    if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (event.key === "ArrowRight")
      next = Math.min(shots.length - 1, index + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = shots.length - 1;
    else return;
    event.preventDefault();
    const target = shots[next];
    if (target && next !== index) {
      onSelectShot(target.id);
      shotButtons.current[target.id]?.focus();
    }
  }
  function restoreShotFocus(id: string) {
    const opener = actionButtons.current[id];
    if (opener?.isConnected) opener.focus();
    else
      Object.values(shotButtons.current)
        .find((button) => button?.isConnected)
        ?.focus();
  }

  useEffect(() => {
    let cancelled = false;
    for (const shot of shots) {
      if (
        shot.image_url ||
        !shot.video_url ||
        Object.hasOwn(posters, shot.video_url)
      )
        continue;
      const videoUrl = shot.video_url;
      thumbnailGenerator
        .extractFrame(videoUrl, 0)
        .then((frame) => {
          if (!cancelled)
            setPosters((prev) => ({ ...prev, [videoUrl]: frame }));
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
                ref={(button) => {
                  shotButtons.current[shot.id] = button;
                }}
                onKeyDown={(event) => navigateShot(event, index)}
                aria-keyshortcuts="ArrowLeft ArrowRight Home End"
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <WorkspaceCommand
                      label={`Shot ${shot.order} actions`}
                      ref={(button) => {
                        actionButtons.current[shot.id] = button;
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </WorkspaceCommand>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    aria-label={`Shot ${shot.order} actions`}
                  >
                    <DropdownMenuItem
                      disabled={index === 0}
                      onSelect={() => onMoveShot(index, "up")}
                    >
                      <ArrowLeft size={14} />
                      Move earlier
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === shots.length - 1}
                      onSelect={() => onMoveShot(index, "down")}
                    >
                      <ArrowRight size={14} />
                      Move later
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={
                        shot.status === "generating" || shot.generationPending
                      }
                      aria-description={
                        (shot.status === "generating" || shot.generationPending)
                          ? "Wait for this shot's current request to finish."
                          : undefined
                      }
                      onSelect={() =>
                        onDeleteShot(shot.id, () => restoreShotFocus(shot.id))
                      }
                    >
                      <Trash2 size={14} />
                      Delete shot
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ol>
      <button onClick={onAddShot} className="shot-browser-add">
        <Plus size={16} />
        Add shot
      </button>
    </section>
  );
}
