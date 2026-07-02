import { Film } from "lucide-react";
import { useVideoDurations } from "../hooks/useVideoDurations";

interface MediaPoolShot {
  id: string;
  order: number;
  image_url: string | null;
  video_url: string | null;
  status: "pending" | "generating" | "complete" | "failed";
  duration: number;
}

interface MediaPoolProps {
  shots: MediaPoolShot[];
  onDragStart?: (shotId: string) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function statusColor(status: MediaPoolShot["status"]): string {
  switch (status) {
    case "complete":
      return "bg-green-500";
    case "generating":
      return "bg-yellow-500";
    case "failed":
      return "bg-red-500";
    case "pending":
    default:
      return "bg-gray-500";
  }
}

export default function MediaPool({ shots, onDragStart }: MediaPoolProps) {
  const visibleShots = shots.filter((s) => s.image_url);
  const probedDurations = useVideoDurations(visibleShots);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-2 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Media Pool
        </span>
      </div>
      <div
        className="flex-1 overflow-y-auto px-2 pb-2"
      >
        {visibleShots.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-xs">No shots with images yet</p>
          </div>
        ) : (
          <>
            {/* Section header */}
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <Film className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Storyboard Shots
              </span>
            </div>
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
              }}
            >
              {visibleShots.map((shot) => {
                const hasVideo = !!shot.video_url;
                const isDraggable = hasVideo && shot.status === "complete";
                return (
                  <div
                    key={shot.id}
                    draggable={isDraggable}
                    onDragStart={(e) => {
                      if (!isDraggable) return;
                      e.dataTransfer.setData("application/x-showbiz-shot", shot.id);
                      e.dataTransfer.effectAllowed = "copy";
                      onDragStart?.(shot.id);
                    }}
                    className={`group ${
                      isDraggable
                        ? "cursor-grab active:cursor-grabbing hover:brightness-110"
                        : "cursor-default opacity-50"
                    }`}
                  >
                    {/* 16:9 thumbnail */}
                    <div className="relative aspect-video bg-muted overflow-hidden rounded-sm">
                      {shot.image_url && (
                        <img
                          src={shot.image_url}
                          alt={`Shot ${shot.order}`}
                          className="absolute inset-0 w-full h-full object-cover"
                          draggable={false}
                        />
                      )}
                      {/* Shot number overlay */}
                      <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[9px] font-bold leading-none px-1 py-0.5 rounded-sm">
                        #{shot.order}
                      </div>
                      {/* SB badge */}
                      <div className="absolute bottom-0.5 left-0.5 bg-[var(--nle-selection,hsl(var(--primary)))] text-white text-[8px] font-bold leading-none px-1 py-0.5 rounded-sm flex items-center gap-0.5">
                        <Film className="h-2 w-2" />
                        SB
                      </div>
                      {/* Status dot */}
                      <div
                        className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${statusColor(shot.status)}`}
                      />
                    </div>
                    {/* Label row */}
                    <div className="flex items-center justify-between mt-0.5 px-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        Shot #{shot.order}
                      </span>
                      {hasVideo && (
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                          {formatDuration(probedDurations[shot.id] ?? shot.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
