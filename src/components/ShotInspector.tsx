import { InspectorHelp } from "./InspectorHelp";
import { ShotVideoSettings } from "./ShotVideoSettings";
import { Link } from "react-router";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ChevronDown,
  Loader2,
  Sparkles,
  Upload,
  Video,
  ImageIcon,
  AlertCircle,
  X,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ImageVersionTimeline from "./ImageVersionTimeline";
import VideoVersionTimeline from "./VideoVersionTimeline";
import type {
  ImageVersionNode,
  ImageVersionWithUrl,
  VideoVersionNode,
  VideoVersionWithUrl,
} from "../lib/backend-api";
import { shotGenerationReadiness } from "../lib/shot-generation-readiness";
import { filterFrameOptions } from "../lib/bible-compose";
import type {
  ImageModelInfo,
  VideoGenerationSettings,
  VideoModelInfo,
} from "../lib/models/types";

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
  modelControls?: ReactNode;
  frameLibraryHref?: string;
  frameError?: { role: ShotFrameRole; message: string } | null;
  frameSaving?: boolean;
  onDismissFrameError?: () => void;
  generationCost?: ReactNode;
  generationDisabled?: boolean;
  generationPending?: boolean;
  videoSettingsSaving?: boolean;
  videoSettingsError?: string | null;
  videoSettingsNotice?: string;
  onRetryVideoSettingsSave?: () => void;
  onDiscardVideoSettings?: () => void;
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
  onClearStartFrame?: (shotId: string) => void;
  // Video actions
  onGenerateVideo: (shotId: string) => void;
  onCancelVideoGeneration: (shotId: string) => void;
  onUpdateShot: (shotId: string, updates: { video_prompt?: string }) => void;
  imageModel?: ImageModelInfo | null;
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
  const sectionId = useId();
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        aria-expanded={open}
        aria-controls={sectionId}
        onClick={() => setOpen(!open)}
        className="inspector-section-heading"
      >
        {title}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div id={sectionId} className="px-3 pb-3">
          {children}
        </div>
      )}
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
          <span className="text-xs">No {label.toLowerCase()}</span>
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
  openerRef,
}: {
  label: string;
  frameOptions: FrameOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (variantId: string) => void;
  openerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [query, setQuery] = useState("");
  const filtered = filterFrameOptions(frameOptions, query);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl" onCloseAutoFocus={(event) => {
        if (openerRef.current?.isConnected) {
          event.preventDefault();
          openerRef.current.focus();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Choose {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Search frames"
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
                aria-label={`Choose frame ${f.label}`}
                onClick={() => {
                  onPick(f.variantId);
                  close(false);
                }}
                title={f.prompt || f.label}
                className="group rounded border border-border bg-muted/40 p-1.5 text-left hover:border-primary"
              >
                <div className="aspect-video w-full overflow-hidden rounded bg-muted">
                  {f.url ? (
                    <img
                      src={f.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                      <ImageIcon className="h-5 w-5" />
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs font-medium">{f.label}</p>
                {f.prompt && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
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
  libraryHref,
  disabled = false,
}: {
  label: string;
  previewUrl: string | null;
  frameOptions: FrameOption[];
  onPick: (variantId: string) => void;
  onUpload: (file: File) => void;
  onClear?: () => void;
  libraryHref?: string;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOpener = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <FramePreview url={previewUrl} label={label} />
      <div className="frame-actions mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="min-w-0 flex-1 basis-32 text-xs"
          aria-label={`Choose ${label.toLowerCase()}`}
          onClick={(event) => {
            pickerOpener.current = event.currentTarget;
            setPickerOpen(true);
          }}
          disabled={disabled || frameOptions.length === 0}
          title={
            frameOptions.length === 0
              ? "Compose frames in the Bible first"
              : undefined
          }
        >
          <ImageIcon className="h-3 w-3 mr-1" />
          Choose
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          disabled={disabled}
          aria-label={`Upload ${label.toLowerCase()}`}
          onClick={() => uploadFramePicker(onUpload)}
        >
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </Button>
        {onClear && previewUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={onClear}
          >
            <X className="h-3 w-3 mr-1" />
            Remove
          </Button>
        )}
      </div>
      {frameOptions.length === 0 && libraryHref && (
        <p className="mt-2 text-xs text-muted-foreground">
          <Link
            to={libraryHref}
            className="text-primary underline underline-offset-2"
          >
            Create a frame in the Bible
          </Link>{" "}
          or upload an image.
        </p>
      )}
      <FramePickerDialog
        openerRef={pickerOpener}
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
  modelControls,
  frameLibraryHref,
  frameError,
  frameSaving = false,
  onDismissFrameError,
  generationCost,
  generationDisabled = false,
  generationPending = false,
  videoSettingsSaving = false,
  videoSettingsError,
  videoSettingsNotice,
  onRetryVideoSettingsSave,
  onDiscardVideoSettings,
  shot,
  frameOptions,
  onPickFrame,
  onUploadFrame,
  onClearEndFrame,
  onClearStartFrame,
  onGenerateVideo,
  onCancelVideoGeneration,
  onUpdateShot,
  imageModel,
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
        <div className="w-full self-start">
          {modelControls}
          <p className="p-3 text-sm">Select a shot to inspect</p>
        </div>
      </div>
    );
  }

  const readiness = shotGenerationReadiness(shot, videoModel);

  const supportsEndFrame =
    videoModel?.modeCapabilities.imageToVideo?.supportsEndImage === true;

  return (
    <div className="shot-inspector h-full min-h-0 flex flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {modelControls}

        {/* Start Frame Section */}
        {videoModel?.modeCapabilities.imageToVideo ? (
          <InspectorSection title="Start frame">
            <FramePicker
              label="Start frame"
              libraryHref={frameLibraryHref}
              disabled={frameSaving}
              onClear={
                onClearStartFrame ? () => onClearStartFrame(shot.id) : undefined
              }
              previewUrl={shot.image_url}
              frameOptions={frameOptions}
              onPick={(variantId) => onPickFrame(shot.id, "start", variantId)}
              onUpload={(file) => onUploadFrame(shot.id, "start", file)}
            />
            {shot.image_url && (
              <div className="mt-2 space-y-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  aria-label={`Edit frame for shot ${shot.order}`}
                  disabled={
                    frameSaving ||
                    !currentVersion ||
                    !imageModel?.supportsImageEditing
                  }
                  onClick={() => {
                    if (currentVersion) onEditImage(shot.id, currentVersion.id);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Edit frame
                </Button>
                {(!currentVersion || !imageModel?.supportsImageEditing) && (
                  <p className="text-xs text-muted-foreground">
                    {!currentVersion
                      ? "Choose or upload a frame to create an editable take."
                      : `${imageModel?.name ?? "The image model"} does not support editing. Choose an editing model in Models for this shot.`}
                  </p>
                )}
              </div>
            )}
          </InspectorSection>
        ) : (
          <p className="border-b border-border/50 px-3 py-3 text-xs text-muted-foreground">
            {videoModel?.name ?? "This model"} uses the video prompt; frames are
            not sent.
          </p>
        )}

        {/* Image Versions Section */}
        {versionCount > 0 && (
          <InspectorSection title="Image takes">
            <ImageVersionTimeline
              versions={versions}
              currentVersionId={currentVersion?.id || null}
              onVersionSelect={(versionId) =>
                onVersionSelect(shot.id, versionId)
              }
              onBranchFrom={(versionId) => onBranchFrom(shot.id, versionId)}
              onEditFrom={(versionId) => onEditImage(shot.id, versionId)}
              compact
            />
          </InspectorSection>
        )}

        {/* End Frame Section */}
        {(supportsEndFrame || shot.end_frame_url) && (
          <InspectorSection
            key={`end:${shot.id}:${videoModel?.id}`}
            title={
              !supportsEndFrame
                ? "Saved end frame"
                : videoModel?.modeCapabilities.imageToVideo?.requiresEndImage
                  ? "End frame (required)"
                  : "End frame (optional)"
            }
            defaultOpen={
              !!shot.end_frame_url ||
              videoModel?.modeCapabilities.imageToVideo?.requiresEndImage
            }
          >
            {!supportsEndFrame ? (
              <div className="space-y-2">
                <FramePreview
                  url={shot.end_frame_url}
                  label="Saved end frame"
                />
                <p className="text-xs text-muted-foreground">
                  {videoModel?.name ?? "This model"} does not use this saved end
                  frame.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={frameSaving}
                  onClick={() => onClearEndFrame(shot.id)}
                >
                  Remove saved end frame
                </Button>
              </div>
            ) : (
              <>
                {!shot.image_url && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    An end frame is used only with a start frame.
                  </p>
                )}
                <FramePicker
                  label="End frame"
                  disabled={frameSaving}
                  previewUrl={shot.end_frame_url}
                  frameOptions={frameOptions}
                  onPick={(variantId) => onPickFrame(shot.id, "end", variantId)}
                  onUpload={(file) => onUploadFrame(shot.id, "end", file)}
                  onClear={() => onClearEndFrame(shot.id)}
                />
              </>
            )}
          </InspectorSection>
        )}

        {/* Prompt Section */}
        <InspectorSection title="Video prompt">
          <Textarea
            aria-label="Video prompt"
            className="min-h-[72px] text-sm resize-y"
            placeholder="Describe the motion between the frames..."
            value={shot.video_prompt ?? ""}
            onChange={(e) =>
              onUpdateShot(shot.id, { video_prompt: e.target.value })
            }
          />
          <div className="inspector-assistance">
            <span>Google AI prompt tools</span>
            <InspectorHelp label="About prompt assistance">
              Prompt assistance uses Google AI (Gemini). Add its key in
              Settings. Any charges are outside the video estimate.
            </InspectorHelp>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-xs"
              onClick={() => onGenerateVideoPrompt(shot.id)}
              disabled={isGeneratingPrompt || !shot.image_url}
            >
              {isGeneratingPrompt ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <ImageIcon className="h-3 w-3 mr-1" />
              )}
              Describe frame
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-xs"
              onClick={() => onEnhanceVideoPrompt(shot.id)}
              disabled={isEnhancingPrompt || !shot.video_prompt}
            >
              {isEnhancingPrompt ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Improve prompt
            </Button>
          </div>
        </InspectorSection>

        {/* Generate Video Section */}
        <InspectorSection title="Video settings">
          {videoSettingsNotice && (
            <p role="status" className="mb-2 text-xs text-muted-foreground">
              {videoSettingsNotice}
            </p>
          )}
          <ShotVideoSettings
            videoModel={videoModel}
            videoSettings={videoSettings}
            onVideoSettingsChange={onVideoSettingsChange}
            videoSettingsSaving={videoSettingsSaving}
          />
        </InspectorSection>

        {/* Video Versions Section */}
        {videoVersionCount > 0 && (
          <InspectorSection title="Video takes">
            <VideoVersionTimeline
              versions={videoVersions}
              currentVersionId={currentVideoVersion?.id || null}
              onVersionSelect={(versionId) =>
                onVideoVersionSelect(shot.id, versionId)
              }
              compact
            />
          </InspectorSection>
        )}
      </div>
      <footer
        aria-label="Shot generation"
        className="shrink-0 border-t border-border bg-background px-3 py-2"
      >
        {frameSaving && (
          <p role="status" className="mb-2 text-xs text-muted-foreground">
            Saving frame selection…
          </p>
        )}
        {frameError && (
          <div className="mb-2 space-y-2">
            <p role="alert" className="text-xs text-destructive">
              {frameError.role === "start" ? "Start frame" : "End frame"}:{" "}
              {frameError.message}
            </p>
            <Button size="sm" variant="ghost" onClick={onDismissFrameError}>
              Keep current frames
            </Button>
          </div>
        )}
        {videoSettingsError && (
          <div className="mb-2 space-y-2">
            <p role="alert" className="text-xs text-destructive">
              {videoSettingsError}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={onRetryVideoSettingsSave}
                disabled={videoSettingsSaving}
              >
                Retry settings save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDiscardVideoSettings}
                disabled={videoSettingsSaving}
              >
                Discard changes
              </Button>
            </div>
          </div>
        )}
        <div className="max-h-[28vh] overflow-y-auto">{generationCost}</div>
        {!readiness.ok && (
          <p role="status" className="mb-2 text-xs text-muted-foreground">
            {readiness.error.message}
          </p>
        )}
        <Button
          size="sm"
          className="w-full text-xs"
          aria-label={`Generate video for shot ${shot.order}`}
          onClick={() => onGenerateVideo(shot.id)}
          disabled={
            generationDisabled || shot.status === "generating" || !readiness.ok
          }
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
        {(shot.status === "generating" || generationPending) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Stops waiting locally. Provider work and charges may continue.
          </p>
        )}
        {shot.status === "generating" && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full text-xs"
            onClick={() => onCancelVideoGeneration(shot.id)}
          >
            Stop Waiting
          </Button>
        )}
        {shot.error_message && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{shot.error_message}</span>
          </div>
        )}
      </footer>
    </div>
  );
}
