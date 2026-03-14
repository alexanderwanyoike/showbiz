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

export default function MediaPool({ shots }: MediaPoolProps) {
  const visibleShots = shots.filter((s) => s.image_url);

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
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            }}
          >
            {visibleShots.map((shot) => {
              const hasVideo = !!shot.video_url;
              return (
                <div
                  key={shot.id}
                  className={`group cursor-default ${
                    hasVideo
                      ? "hover:brightness-110"
                      : "opacity-50"
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
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                      {formatDuration(shot.duration)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
