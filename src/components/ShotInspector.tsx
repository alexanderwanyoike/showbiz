import { useState } from "react";
import { ChevronDown, Loader2, Sparkles, Upload, Video, ImageIcon, AlertCircle, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ImageVersionTimeline from "./ImageVersionTimeline";
import VideoVersionTimeline from "./VideoVersionTimeline";
import type { ImageVersionNode, ImageVersionWithUrl, VideoVersionNode, VideoVersionWithUrl } from "../lib/backend-api";
import { hasUsableShotVideoSource } from "../lib/bible-assets";
import { filterFrameOptions } from "../lib/bible-compose";
import type { VideoGenerationSettings, VideoModelInfo } from "../lib/models/types";

export type ShotFrameRole = "start" | "end";

// A composed frame from the bible that a shot can use as a start/end frame.
export interface FrameOption {
  variantId: string;
  label: string;
  url: string | null;
  /** The prompt behind the frame's current take; searched alongside the name */
  prompt: string;
}

export interface ShotInspectorProps {
  shot: {
    id: string;
    order: number;
    image_prompt: string | null;
    image_url: string | null;
    end_frame_url: string | null;
    video_prompt: string | null;
    status: "pending" | "generating" | "complete" | "failed";
    error_message?: string | null;
  } | null;
  // Frame actions
  frameOptions: FrameOption[];
  onPickFrame: (shotId: string, role: ShotFrameRole, variantId: string) => void;
  onUploadFrame: (shotId: string, role: ShotFrameRole, file: File) => void;
  onClearEndFrame: (shotId: string) => void;
  // Video actions
  onGenerateVideo: (shotId: string) => void;
  onCancelVideoGeneration: (shotId: string) => void;
  onUpdateShot: (shotId: string, updates: { video_prompt?: string }) => void;
  videoModel: VideoModelInfo | null;
  videoSettings: VideoGenerationSettings;
  onVideoSettingsChange: (settings: VideoGenerationSettings) => void;
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

function FramePreview({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded border border-border/60 bg-muted">
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/50">
          <ImageIcon className="h-5 w-5" />
          <span className="text-[10px]">No {label.toLowerCase()}</span>
        </div>
      )}
    </div>
  );
}

function uploadFramePicker(onFile: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

// Full-size searchable browser for the bible's frames. Search matches the
// frame's name or the prompt behind its current take.
function FramePickerDialog({
  label,
  frameOptions,
  open,
  onOpenChange,
  onPick,
}: {
  label: string;
  frameOptions: FrameOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (variantId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = filterFrameOptions(frameOptions, query);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or prompt..."
            className="pl-8"
          />
        </div>
        {filtered.length > 0 ? (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
            {filtered.map((f) => (
              <button
                key={f.variantId}
                type="button"
                onClick={() => {
                  onPick(f.variantId);
                  close(false);
                }}
                title={f.prompt || f.label}
                className="group rounded border border-border bg-muted/40 p-1.5 text-left hover:border-primary"
              >
                <div className="aspect-video w-full overflow-hidden rounded bg-muted">
                  {f.url ? (
                    <img src={f.url} alt={f.label} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                      <ImageIcon className="h-5 w-5" />
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs font-medium">{f.label}</p>
                {f.prompt && (
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                    {f.prompt}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {frameOptions.length === 0
              ? "No frames yet. Compose frames in the Bible, then pick them here."
              : `No frames match "${query}".`}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Pick a frame made in the Bible, or upload one. No generation here - the
// storyboard just assembles; all composition happens in the Bible.
function FramePicker({
  label,
  previewUrl,
  frameOptions,
  onPick,
  onUpload,
  onClear,
}: {
  label: string;
  previewUrl: string | null;
  frameOptions: FrameOption[];
  onPick: (variantId: string) => void;
  onUpload: (file: File) => void;
  onClear?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <FramePreview url={previewUrl} label={label} />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setPickerOpen(true)}
          disabled={frameOptions.length === 0}
          title={frameOptions.length === 0 ? "Compose frames in the Bible first" : undefined}
        >
          <ImageIcon className="h-3 w-3 mr-1" />
          Choose Frame
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => uploadFramePicker(onUpload)}>
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </Button>
        {onClear && previewUrl && (
          <Button size="sm" variant="outline" className="text-xs" onClick={onClear}>
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      {frameOptions.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">Make frames in the Bible, then pick them here.</p>
      )}
      <FramePickerDialog
        label={label}
        frameOptions={frameOptions}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={onPick}
      />
    </>
  );
}

export default function ShotInspector({
  shot,
  frameOptions,
  onPickFrame,
  onUploadFrame,
  onClearEndFrame,
  onGenerateVideo,
  onCancelVideoGeneration,
  onUpdateShot,
  videoModel,
  videoSettings,
  onVideoSettingsChange,
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

  const canGenerateVideo = hasUsableShotVideoSource({
    imageUrl: shot.image_url,
    prompt: shot.video_prompt,
  });

  const supportsEndFrame = videoModel?.modeCapabilities.imageToVideo?.supportsEndImage === true;

  const hasVideoSettings =
    !!videoModel &&
    (videoModel.capabilities.durations.length > 1 ||
      (videoModel.capabilities.resolutions?.length ?? 0) > 1 ||
      (videoModel.capabilities.aspectRatios?.length ?? 0) > 1 ||
      videoModel.capabilities.hasAudio === true);

  return (
    <div className="h-full overflow-y-auto">
      {/* Shot header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
        <span className="text-sm font-medium">Shot {shot.order}</span>
        <Badge variant="secondary" className="text-xs">
          {shot.status}
        </Badge>
      </div>

      {/* Start Frame Section */}
      <InspectorSection title="Start Frame">
        <FramePicker
          label="Start frame"
          previewUrl={shot.image_url}
          frameOptions={frameOptions}
          onPick={(variantId) => onPickFrame(shot.id, "start", variantId)}
          onUpload={(file) => onUploadFrame(shot.id, "start", file)}
        />
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

      {/* End Frame Section */}
      <InspectorSection title="End Frame" defaultOpen={!!shot.end_frame_url}>
        {!supportsEndFrame ? (
          <p className="text-[11px] text-muted-foreground">
            {videoModel?.name ?? "This model"} doesn't support an end frame. The start frame and prompt drive the shot.
          </p>
        ) : (
          <FramePicker
            label="End frame"
            previewUrl={shot.end_frame_url}
            frameOptions={frameOptions}
            onPick={(variantId) => onPickFrame(shot.id, "end", variantId)}
            onUpload={(file) => onUploadFrame(shot.id, "end", file)}
            onClear={() => onClearEndFrame(shot.id)}
          />
        )}
      </InspectorSection>

      {/* Prompt Section */}
      <InspectorSection title="Prompt">
        <Textarea
          className="min-h-[88px] text-sm resize-y"
          placeholder="Describe the motion between the frames..."
          value={shot.video_prompt ?? ""}
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
        {videoModel && (
          <div className="mb-3 rounded border border-border/60 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium">{videoModel.name}</p>
              {hasVideoSettings && <span className="text-[10px] text-muted-foreground">Settings</span>}
            </div>
            {hasVideoSettings ? (
              <div className="grid grid-cols-2 gap-2">
                {videoModel.capabilities.durations.length > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Duration</label>
                    <Select
                      value={videoSettings.duration}
                      onValueChange={(duration) => onVideoSettingsChange({ ...videoSettings, duration })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {videoModel.capabilities.durations.map((duration) => (
                          <SelectItem key={duration} value={duration}>
                            {duration === "auto" ? "Auto" : `${duration}s`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(videoModel.capabilities.resolutions?.length ?? 0) > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Resolution</label>
                    <Select
                      value={videoSettings.resolution ?? ""}
                      onValueChange={(resolution) => onVideoSettingsChange({ ...videoSettings, resolution })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {videoModel.capabilities.resolutions!.map((resolution) => (
                          <SelectItem key={resolution} value={resolution}>
                            {resolution}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(videoModel.capabilities.aspectRatios?.length ?? 0) > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Aspect Ratio</label>
                    <Select
                      value={videoSettings.aspectRatio ?? ""}
                      onValueChange={(aspectRatio) => onVideoSettingsChange({ ...videoSettings, aspectRatio })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {videoModel.capabilities.aspectRatios!.map((aspectRatio) => (
                          <SelectItem key={aspectRatio} value={aspectRatio}>
                            {aspectRatio === "auto" ? "Auto" : aspectRatio}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {videoModel.capabilities.hasAudio && (
                  <div className="flex items-center justify-between gap-2 self-end rounded border border-border/50 px-2 py-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Audio</label>
                    <Switch
                      checked={videoSettings.audio ?? false}
                      onCheckedChange={(audio) => onVideoSettingsChange({ ...videoSettings, audio })}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No configurable video settings for this model.</p>
            )}
          </div>
        )}
        <Button
          size="sm"
          className="w-full text-xs"
          onClick={() => onGenerateVideo(shot.id)}
          disabled={shot.status === "generating" || !canGenerateVideo}
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
        {shot.status === "generating" && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full text-xs"
            onClick={() => onCancelVideoGeneration(shot.id)}
          >
            Stop Waiting
          </Button>
        )}
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
