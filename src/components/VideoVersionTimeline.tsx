import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Sparkles, Film, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VideoVersionNode } from "../lib/tauri-api";

interface VideoVersionTimelineProps {
  versions: VideoVersionNode[];
  currentVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  compact?: boolean;
}

const editTypeConfig: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  generation: { label: "Gen", icon: Sparkles, color: "bg-blue-500" },
  regeneration: { label: "Regen", icon: Sparkles, color: "bg-purple-500" },
  extend: { label: "Extend", icon: Film, color: "bg-green-500" },
};

function VideoThumbnail({ videoUrl, className }: { videoUrl: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Seek to 0.1s to get a frame (avoids black frame at 0)
    video.currentTime = 0.1;
    const onSeeked = () => setHasFrame(true);
    video.addEventListener("seeked", onSeeked, { once: true });
    return () => video.removeEventListener("seeked", onSeeked);
  }, [videoUrl]);

  return (
    <>
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        preload="metadata"
        className={`${className} ${hasFrame ? "" : "opacity-0"}`}
      />
      {!hasFrame && (
        <div className={`${className} absolute inset-0 bg-muted flex items-center justify-center`}>
          <Film className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
    </>
  );
}

function VersionNode({
  node,
  currentVersionId,
  onVersionSelect,
  depth = 0,
  isExpanded,
  onToggleExpand,
}: {
  node: VideoVersionNode;
  currentVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  depth?: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const { version, children } = node;
  const isCurrent = version.id === currentVersionId;
  const hasChildren = children.length > 0;
  const config = editTypeConfig[version.edit_type] || editTypeConfig.generation;
  const Icon = config.icon;

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center gap-2 p-1 rounded-md group ${
          isCurrent ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
        }`}
        style={{ marginLeft: depth * 20 }}
      >
        {hasChildren ? (
          <button
            onClick={onToggleExpand}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <div className="w-4" />
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onVersionSelect(version.id)}
                className={`relative w-10 h-10 rounded overflow-hidden border-2 transition-all ${
                  isCurrent
                    ? "border-primary shadow-md"
                    : "border-transparent hover:border-muted-foreground/50"
                }`}
              >
                <VideoThumbnail
                  videoUrl={version.video_url}
                  className="w-full h-full object-cover"
                />
                {isCurrent && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">Take {version.version_number}</p>
                {version.model_id && (
                  <p className="text-xs text-muted-foreground">{version.model_id}</p>
                )}
                {version.prompt && (
                  <p className="text-xs text-muted-foreground truncate">
                    {version.prompt}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium">Take {version.version_number}</span>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1 py-0 h-4 ${config.color} text-white`}
            >
              <Icon className="h-2 w-2 mr-0.5" />
              {config.label}
            </Badge>
          </div>
          {version.model_id && (
            <span className="text-[10px] text-muted-foreground truncate">
              {version.model_id}
            </span>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="border-l border-muted-foreground/20 ml-3">
          {children.map((child) => (
            <VersionNodeWrapper
              key={child.version.id}
              node={child}
              currentVersionId={currentVersionId}
              onVersionSelect={onVersionSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VersionNodeWrapper(props: {
  node: VideoVersionNode;
  currentVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <VersionNode
      {...props}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
    />
  );
}

export default function VideoVersionTimeline({
  versions,
  currentVersionId,
  onVersionSelect,
  compact = false,
}: VideoVersionTimelineProps) {
  if (versions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        No video takes
      </div>
    );
  }

  if (compact) {
    const allVersions = flattenTree(versions);
    return (
      <div className="flex gap-1 overflow-x-auto py-1">
        {allVersions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          const config = editTypeConfig[version.edit_type] || editTypeConfig.generation;

          return (
            <TooltipProvider key={version.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onVersionSelect(version.id)}
                    className={`relative w-8 h-8 rounded overflow-hidden border-2 flex-shrink-0 transition-all ${
                      isCurrent
                        ? "border-primary shadow-md"
                        : "border-transparent hover:border-muted-foreground/50"
                    }`}
                  >
                    <VideoThumbnail
                      videoUrl={version.video_url}
                      className="w-full h-full object-cover"
                    />
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1 ${config.color}`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Take {version.version_number} ({config.label})
                  {version.model_id && ` - ${version.model_id}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {versions.map((node) => (
        <VersionNodeWrapper
          key={node.version.id}
          node={node}
          currentVersionId={currentVersionId}
          onVersionSelect={onVersionSelect}
        />
      ))}
    </div>
  );
}

function flattenTree(
  nodes: VideoVersionNode[]
): VideoVersionNode["version"][] {
  const result: VideoVersionNode["version"][] = [];
  for (const node of nodes) {
    result.push(node.version);
    result.push(...flattenTree(node.children));
  }
  return result.sort((a, b) => a.version_number - b.version_number);
}
