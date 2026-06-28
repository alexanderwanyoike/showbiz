import { useState } from "react";
import { ChevronDown, Loader2, Sparkles, Upload, Video, ImageIcon, AlertCircle, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { ImageVersionNode, ImageVersionWithUrl, VideoVersionNode, VideoVersionWithUrl } from "../lib/tauri-api";
import type { BibleAsset, BibleAssetVariant } from "../lib/tauri-api";
import { hasUsableShotVideoSource } from "../lib/bible-assets";
import type { VideoGenerationSettings, VideoModelInfo } from "../lib/models/types";

export type ShotFrameRole = "start" | "end";

export interface FrameComposeSelection {
  characterVariantIds: string[];
  locationVariantId: string | null;
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
  onComposeFrame: (shotId: string, role: ShotFrameRole, selection: FrameComposeSelection) => Promise<void>;
  onUploadFrame: (shotId: string, role: ShotFrameRole, file: File) => void;
  onClearEndFrame: (shotId: string) => void;
  // Video actions
  onGenerateVideo: (shotId: string) => void;
  onCancelVideoGeneration: (shotId: string) => void;
  onUpdateShot: (shotId: string, updates: { video_prompt?: string }) => void;
  videoModel: VideoModelInfo | null;
  videoSettings: VideoGenerationSettings;
  onVideoSettingsChange: (settings: VideoGenerationSettings) => void;
  bibleAssets: BibleAsset[];
  bibleVariants: Record<string, BibleAssetVariant[]>;
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

function primaryPicture(variants: BibleAssetVariant[]): BibleAssetVariant | null {
  return (
    variants.find((v) => v.is_primary && v.media_url) ??
    variants.find((v) => v.media_url) ??
    null
  );
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

function Thumb({ url, active, label, onClick }: { url: string | null; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`relative h-12 w-16 shrink-0 overflow-hidden rounded border text-[9px] transition-colors ${active ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/40"}`}
    >
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/60">{label.slice(0, 8)}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] text-white">{label}</span>
      {active && (
        <span className="absolute right-0.5 top-0.5 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
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

// who (any number of characters) + where (a location, optional view) + what (prompt) -> a frame
function FrameComposer({
  label,
  previewUrl,
  characters,
  locations,
  bibleVariants,
  onCompose,
  onUpload,
  onClear,
}: {
  label: string;
  previewUrl: string | null;
  characters: BibleAsset[];
  locations: BibleAsset[];
  bibleVariants: Record<string, BibleAssetVariant[]>;
  onCompose: (selection: FrameComposeSelection) => Promise<void>;
  onUpload: (file: File) => void;
  onClear?: () => void;
}) {
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationVariantId, setLocationVariantId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleChar(assetId: string) {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function pickLocation(assetId: string) {
    if (locationId === assetId) {
      setLocationId(null);
      setLocationVariantId(null);
    } else {
      setLocationId(assetId);
      setLocationVariantId(primaryPicture(bibleVariants[assetId] ?? [])?.id ?? null);
    }
  }

  const locationViews = locationId ? (bibleVariants[locationId] ?? []).filter((v) => v.media_url) : [];

  async function handleMake() {
    setBusy(true);
    try {
      const characterVariantIds = [...selectedChars]
        .map((id) => primaryPicture(bibleVariants[id] ?? [])?.id)
        .filter((id): id is string => !!id);
      await onCompose({ characterVariantIds, locationVariantId, prompt });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FramePreview url={previewUrl} label={label} />

      {characters.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Who?</p>
          <div className="flex flex-wrap gap-1.5">
            {characters.map((c) => (
              <Thumb
                key={c.id}
                url={primaryPicture(bibleVariants[c.id] ?? [])?.media_url ?? null}
                active={selectedChars.has(c.id)}
                label={c.name}
                onClick={() => toggleChar(c.id)}
              />
            ))}
          </div>
        </div>
      )}

      {locations.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Where?</p>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((l) => (
              <Thumb
                key={l.id}
                url={primaryPicture(bibleVariants[l.id] ?? [])?.media_url ?? null}
                active={locationId === l.id}
                label={l.name}
                onClick={() => pickLocation(l.id)}
              />
            ))}
          </div>
          {locationViews.length > 1 && (
            <div className="mt-1.5">
              <p className="mb-1 text-[10px] text-muted-foreground">View</p>
              <div className="flex flex-wrap gap-1">
                {locationViews.map((v, i) => (
                  <Thumb
                    key={v.id}
                    url={v.media_url ?? null}
                    active={locationVariantId === v.id}
                    label={`View ${i + 1}`}
                    onClick={() => setLocationVariantId(v.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Textarea
        className="mt-2 min-h-[60px] text-sm resize-y"
        placeholder="What's happening (and the look, e.g. 90s anime)..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="mt-2 flex gap-2">
        <Button size="sm" className="flex-1 text-xs" onClick={handleMake} disabled={busy || !prompt.trim()}>
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          Make frame
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

      {characters.length === 0 && locations.length === 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Add Characters and Locations in the Bible to compose from them, or just describe the frame above.
        </p>
      )}
    </>
  );
}

export default function ShotInspector({
  shot,
  onComposeFrame,
  onUploadFrame,
  onClearEndFrame,
  onGenerateVideo,
  onCancelVideoGeneration,
  onUpdateShot,
  videoModel,
  videoSettings,
  onVideoSettingsChange,
  bibleAssets,
  bibleVariants,
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

  const characters = bibleAssets.filter((a) => a.asset_type === "character");
  const locations = bibleAssets.filter((a) => a.asset_type === "location");

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
        <FrameComposer
          key={`${shot.id}-start`}
          label="Start frame"
          previewUrl={shot.image_url}
          characters={characters}
          locations={locations}
          bibleVariants={bibleVariants}
          onCompose={(selection) => onComposeFrame(shot.id, "start", selection)}
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
          <FrameComposer
            key={`${shot.id}-end`}
            label="End frame"
            previewUrl={shot.end_frame_url}
            characters={characters}
            locations={locations}
            bibleVariants={bibleVariants}
            onCompose={(selection) => onComposeFrame(shot.id, "end", selection)}
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
