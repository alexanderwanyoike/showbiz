import { useState } from "react";
import { ChevronDown, Loader2, Sparkles, Upload, Video, ImageIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import ImageVersionTimeline from "./ImageVersionTimeline";
import VideoVersionTimeline from "./VideoVersionTimeline";
import type { ImageVersionNode, ImageVersionWithUrl, VideoVersionNode, VideoVersionWithUrl } from "../lib/tauri-api";

export interface ShotInspectorProps {
  shot: {
    id: string;
    order: number;
    image_prompt: string | null;
    image_url: string | null;
    video_prompt: string | null;
    video_url: string | null;
    status: "pending" | "generating" | "complete" | "failed";
    error_message?: string | null;
  } | null;
  // Image actions
  onGenerateImage: (shotId: string) => void;
  onUploadImage: (shotId: string, file: File) => void;
  // Video actions
  onGenerateVideo: (shotId: string) => void;
  onUpdateShot: (shotId: string, updates: { video_prompt?: string }) => void;
  // Version data
  versions: ImageVersionNode[];
  currentVersion: ImageVersionWithUrl | null;
  versionCount: number;
  videoVersions: VideoVersionNode[];
  currentVideoVersion: VideoVersionWithUrl | null;
  videoVersionCount: number;
  // Version callbacks
  onVersionSelect: (shotId: string, versionId: string) => void;
  onBranchFrom: (shotId: string, versionId: string) => void;
  onEditImage: (shotId: string, versionId: string) => void;
  onVideoVersionSelect: (shotId: string, versionId: string) => void;
  // Prompt generation
  onGenerateVideoPrompt: (shotId: string) => void;
  onEnhanceVideoPrompt: (shotId: string) => void;
  isGeneratingPrompt: boolean;
  isEnhancingPrompt: boolean;
}

function InspectorSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
      >
        {title}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export default function ShotInspector({
  shot,
  onGenerateImage,
  onUploadImage,
  onGenerateVideo,
  onUpdateShot,
  versions,
  currentVersion,
  versionCount,
  videoVersions,
  currentVideoVersion,
  videoVersionCount,
  onVersionSelect,
  onBranchFrom,
  onEditImage,
  onVideoVersionSelect,
  onGenerateVideoPrompt,
  onEnhanceVideoPrompt,
  isGeneratingPrompt,
  isEnhancingPrompt,
}: ShotInspectorProps) {
  if (!shot) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a shot to inspect</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Shot header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
        <span className="text-sm font-medium">Shot {shot.order + 1}</span>
        <Badge variant="secondary" className="text-xs">
          {shot.status}
        </Badge>
      </div>

      {/* Image Prompt Section */}
      <InspectorSection title="Image Prompt">
        <Textarea
          className="min-h-[60px] text-sm resize-none"
          placeholder="No image prompt set"
          value={shot.image_prompt || ""}
          readOnly
        />
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onGenerateImage(shot.id)}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Generate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) onUploadImage(shot.id, file);
              };
              input.click();
            }}
          >
            <Upload className="h-3 w-3 mr-1" />
            Upload
          </Button>
        </div>
      </InspectorSection>

      {/* Image Versions Section */}
      {versionCount > 0 && (
        <InspectorSection title="Image Versions">
          <ImageVersionTimeline
            versions={versions}
            currentVersionId={currentVersion?.id || null}
            onVersionSelect={(versionId) => onVersionSelect(shot.id, versionId)}
            onBranchFrom={(versionId) => onBranchFrom(shot.id, versionId)}
            onEditFrom={(versionId) => onEditImage(shot.id, versionId)}
            compact
          />
        </InspectorSection>
      )}

      {/* Video Prompt Section */}
      <InspectorSection title="Video Prompt">
        <Textarea
          className="min-h-[60px] text-sm resize-none"
          placeholder="Describe camera movement, action..."
          value={shot.video_prompt || ""}
          onChange={(e) => onUpdateShot(shot.id, { video_prompt: e.target.value })}
        />
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onGenerateVideoPrompt(shot.id)}
            disabled={isGeneratingPrompt || !shot.image_url}
          >
            {isGeneratingPrompt ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <ImageIcon className="h-3 w-3 mr-1" />
            )}
            From Image
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onEnhanceVideoPrompt(shot.id)}
            disabled={isEnhancingPrompt || !shot.video_prompt}
          >
            {isEnhancingPrompt ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Enhance
          </Button>
        </div>
      </InspectorSection>

      {/* Generate Video Section */}
      <InspectorSection title="Generate Video">
        <Button
          size="sm"
          className="w-full text-xs"
          onClick={() => onGenerateVideo(shot.id)}
          disabled={shot.status === "generating" || !shot.image_url}
        >
          {shot.status === "generating" ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Video className="h-3 w-3 mr-1" />
              Generate Video
            </>
          )}
        </Button>
        {shot.status === "failed" && shot.error_message && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{shot.error_message}</span>
          </div>
        )}
      </InspectorSection>

      {/* Video Versions Section */}
      {videoVersionCount > 0 && (
        <InspectorSection title="Video Versions">
          <VideoVersionTimeline
            versions={videoVersions}
            currentVersionId={currentVideoVersion?.id || null}
            onVersionSelect={(versionId) => onVideoVersionSelect(shot.id, versionId)}
            compact
          />
        </InspectorSection>
      )}
    </div>
  );
}
