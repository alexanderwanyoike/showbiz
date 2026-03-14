import { useState } from "react";
import { Lock, Unlock, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrackHeaderProps {
  name: string;
  type: "video" | "audio";
}

export default function TrackHeader({ name, type }: TrackHeaderProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  return (
    <div className="w-[120px] flex-shrink-0 bg-muted/80 border-r border-border flex flex-col justify-center px-2 py-1">
      <span className="text-xs font-medium text-muted-foreground truncate mb-1">
        {name}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setIsLocked((v) => !v)}
          title={isLocked ? "Unlock track" : "Lock track"}
        >
          {isLocked ? (
            <Lock className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Unlock className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setIsVisible((v) => !v)}
          title={isVisible ? "Hide track" : "Show track"}
        >
          {isVisible ? (
            <Eye className="h-3 w-3 text-muted-foreground" />
          ) : (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
        {type === "audio" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setIsMuted((v) => !v)}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Volume2 className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
