import { Plus, ChevronUp, ChevronDown, Trash2, Loader2 } from "lucide-react";

export interface ShotListItem {
  id: string;
  order: number;
  image_prompt: string | null;
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

function formatTimecode(order: number): string {
  const totalSeconds = (order - 1) * 8;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const frames = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function getStatusColor(
  status: ShotListItem["status"],
  hasImage: boolean,
  hasVideo: boolean,
): string {
  if (status === "generating") return "bg-orange-400";
  if (status === "failed") return "bg-red-500";
  if (hasImage && hasVideo) return "bg-green-500";
  if (hasImage) return "bg-yellow-400";
  return "bg-gray-500";
}

function truncatePrompt(prompt: string | null): string {
  if (!prompt) return "No prompt";
  if (prompt.length <= 40) return prompt;
  return prompt.slice(0, 40) + "...";
}

export default function ShotList({
  shots,
  selectedShotId,
  onSelectShot,
  onAddShot,
  onMoveShot,
  onDeleteShot,
}: ShotListProps) {
  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex-1">
        {shots.map((shot, index) => {
          const isSelected = shot.id === selectedShotId;
          const hasImage = !!shot.image_url;
          const hasVideo = !!shot.video_url;
          const isGenerating = shot.status === "generating";

          return (
            <div
              key={shot.id}
              className={`group flex items-center gap-2.5 py-1.5 px-2 cursor-pointer ${
                isSelected
                  ? "bg-accent"
                  : "hover:brightness-110 hover:bg-muted/50"
              }`}
              onClick={() => onSelectShot(shot.id)}
            >
              {/* Thumbnail */}
              <div className="relative w-20 shrink-0 aspect-video bg-muted rounded-sm overflow-hidden">
                {shot.image_url ? (
                  <img
                    src={shot.image_url}
                    alt={`Shot ${shot.order}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                    Empty
                  </div>
                )}
              </div>

              {/* Info column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* Status dot */}
                  <span className="relative flex shrink-0">
                    <span
                      className={`w-2 h-2 rounded-full ${getStatusColor(shot.status, hasImage, hasVideo)}`}
                    />
                    {isGenerating && (
                      <Loader2 className="absolute -top-0.5 -left-0.5 w-3 h-3 text-orange-400 animate-spin" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-foreground truncate">
                    #{shot.order}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {truncatePrompt(shot.image_prompt)}
                </p>
                <span className="text-xs font-mono text-muted-foreground/70 tabular-nums">
                  {formatTimecode(shot.order)}
                </span>
              </div>

              {/* Hover actions */}
              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveShot(index, "up");
                  }}
                  disabled={index === 0}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveShot(index, "down");
                  }}
                  disabled={index === shots.length - 1}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteShot(shot.id);
                  }}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive"
                  title="Delete shot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Shot button */}
      <button
        onClick={onAddShot}
        className="mx-2 my-2 py-2 border border-dashed border-border rounded-sm flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Shot
      </button>
    </div>
  );
}
