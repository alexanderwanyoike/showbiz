import { useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Sparkles, Paintbrush, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ImageVersionNode } from "../lib/tauri-api";

interface ImageVersionTimelineProps {
  versions: ImageVersionNode[];
  currentVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  onBranchFrom: (versionId: string) => void;
  onEditFrom: (versionId: string) => void;
  compact?: boolean;
}

const editTypeConfig: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  generation: { label: "Gen", icon: Sparkles, color: "bg-blue-500" },
  regeneration: { label: "Regen", icon: Sparkles, color: "bg-purple-500" },
  remix: { label: "Edit", icon: Paintbrush, color: "bg-green-500" },
  inpaint: { label: "Edit", icon: Paintbrush, color: "bg-orange-500" }, // Legacy support
};

function VersionNode({
  node,
  currentVersionId,
  onVersionSelect,
  onBranchFrom,
  onEditFrom,
  depth = 0,
  isExpanded,
  onToggleExpand,
}: {
  node: ImageVersionNode;
  currentVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  onBranchFrom: (versionId: string) => void;
  onEditFrom: (versionId: string) => void;
  depth?: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const { version, children } = node;
  const isCurrent = version.id === currentVersionId;
  const hasChildren = children.length > 0;
  const config = editTypeConfig[version.edit_type];
  const Icon = config.icon;

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center gap-2 p-1 rounded-md group ${
          isCurrent ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
        }`}
        style={{ marginLeft: depth * 20 }}
      >
        {/* Expand/collapse button for nodes with children */}
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

        {/* Thumbnail */}
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
                <img
                  src={version.image_url}
                  alt={`Version ${version.version_number}`}
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
                <p className="font-medium">Version {version.version_number}</p>
                {version.prompt && (
                  <p className="text-xs text-muted-foreground truncate">
                    {version.prompt}
                  </p>
                )}
                {version.edit_prompt && (
                  <p className="text-xs text-muted-foreground truncate">
                    Edit: {version.edit_prompt}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Version info */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium">v{version.version_number}</span>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1 py-0 h-4 ${config.color} text-white`}
            >
              <Icon className="h-2 w-2 mr-0.5" />
              {config.label}
            </Badge>
          </div>
        </div>

        {/* Actions - visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onEditFrom(version.id)}
                >
                  <Paintbrush className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit this version</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onBranchFrom(version.id)}
                >
                  <GitBranch className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate from here</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <div className="border-l border-muted-foreground/20 ml-3">
          {children.map((child) => (
            <VersionNodeWrapper
              key={child.version.id}
              node={child}
              currentVersionId={currentVersionId}
              onVersionSelect={onVersionSelect}
              onBranchFrom={onBranchFrom}
              onEditFrom={onEditFrom}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VersionNodeWrapper(props: {
  node: ImageVersionNode;
  currentVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  onBranchFrom: (versionId: string) => void;
  onEditFrom: (versionId: string) => void;
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

export default function ImageVersionTimeline({
  versions,
  currentVersionId,
  onVersionSelect,
  onBranchFrom,
  onEditFrom,
  compact = false,
}: ImageVersionTimelineProps) {
  if (versions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        No version history
      </div>
    );
  }

  if (compact) {
    // Compact horizontal filmstrip view
    const allVersions = flattenTree(versions);
    return (
      <div className="flex gap-1 overflow-x-auto py-1">
        {allVersions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          const config = editTypeConfig[version.edit_type];

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
                    <img
                      src={version.image_url}
                      alt={`v${version.version_number}`}
                      className="w-full h-full object-cover"
                    />
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1 ${config.color}`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  v{version.version_number} ({config.label})
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  }

  // Full tree view
  return (
    <div className="space-y-1">
      {versions.map((node) => (
        <VersionNodeWrapper
          key={node.version.id}
          node={node}
          currentVersionId={currentVersionId}
          onVersionSelect={onVersionSelect}
          onBranchFrom={onBranchFrom}
          onEditFrom={onEditFrom}
        />
      ))}
    </div>
  );
}

// Helper to flatten tree for compact view
function flattenTree(
  nodes: ImageVersionNode[]
): ImageVersionNode["version"][] {
  const result: ImageVersionNode["version"][] = [];
  for (const node of nodes) {
    result.push(node.version);
    result.push(...flattenTree(node.children));
  }
  return result.sort((a, b) => a.version_number - b.version_number);
}
