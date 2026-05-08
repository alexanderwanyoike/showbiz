import { useState } from "react";
import { ChevronDown, Loader2, Sparkles, Upload, Video, ImageIcon, AlertCircle } from "lucide-react";
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
import type { BibleAsset, BibleAssetVariant, ShotAssetRefInput } from "../lib/tauri-api";
import { findDefaultVariant, hasUsableShotVideoSource, resolveSelectedVariantId } from "../lib/bible-assets";
import { hasCompiledPromptForGeneration } from "../lib/generation/compile-review";
import type { VideoGenerationSettings, VideoModelInfo } from "../lib/models/types";

export interface ShotInspectorProps {
  shot: {
    id: string;
    order: number;
    image_prompt: string | null;
    image_url: string | null;
    video_prompt: string | null;
    intent_action: string | null;
    intent_camera: string | null;
    intent_mood: string | null;
    compiled_prompt: string | null;
    prompt_override: string | null;
    video_url: string | null;
    status: "pending" | "generating" | "complete" | "failed";
    error_message?: string | null;
  } | null;
  // Image actions
  onGenerateImage: (shotId: string) => void;
  onUploadImage: (shotId: string, file: File) => void;
  // Video actions
  onCompileVideoPrompt: (shotId: string) => void;
  onGenerateVideo: (shotId: string) => void;
  onCancelVideoGeneration: (shotId: string) => void;
  onUpdateShot: (shotId: string, updates: { video_prompt?: string; intent_action?: string; intent_camera?: string; intent_mood?: string; compiled_prompt?: string; prompt_override?: string }) => void;
  videoModel: VideoModelInfo | null;
  videoSettings: VideoGenerationSettings;
  onVideoSettingsChange: (settings: VideoGenerationSettings) => void;
  bibleAssets: BibleAsset[];
  bibleVariants: Record<string, BibleAssetVariant[]>;
  selectedAssetRefs: ShotAssetRefInput[];
  onSetAssetRefs: (shotId: string, refs: ShotAssetRefInput[]) => void;
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
  onCompileVideoPrompt,
  onGenerateVideo,
  onCancelVideoGeneration,
  onUpdateShot,
  videoModel,
  videoSettings,
  onVideoSettingsChange,
  bibleAssets,
  bibleVariants,
  selectedAssetRefs,
  onSetAssetRefs,
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
    selectedRefs: selectedAssetRefs,
  }) && hasCompiledPromptForGeneration(shot.compiled_prompt);
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
          placeholder="Describe the shot action..."
          value={shot.intent_action ?? shot.video_prompt ?? ""}
          onChange={(e) => onUpdateShot(shot.id, { video_prompt: e.target.value, intent_action: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Textarea
            className="min-h-[44px] text-xs resize-none"
            placeholder="Camera"
            value={shot.intent_camera || ""}
            onChange={(e) => onUpdateShot(shot.id, { intent_camera: e.target.value })}
          />
          <Textarea
            className="min-h-[44px] text-xs resize-none"
            placeholder="Mood"
            value={shot.intent_mood || ""}
            onChange={(e) => onUpdateShot(shot.id, { intent_mood: e.target.value })}
          />
        </div>
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

      {bibleAssets.length > 0 && (
        <InspectorSection title="Bible References">
          <div className="space-y-1.5">
            {bibleAssets.map((asset) => {
              const variants = bibleVariants[asset.id] ?? [];
              const defaultVariant = findDefaultVariant(variants);
              const selectedRef = selectedAssetRefs.find((ref) => ref.asset_id === asset.id);
              const selectedVariantId = resolveSelectedVariantId(selectedRef?.variant_id, variants);
              const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? defaultVariant;
              const checked = !!selectedRef;
              return (
                <div key={asset.id} className="space-y-1 rounded border border-border/60 p-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!defaultVariant}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [
                              ...selectedAssetRefs.filter((ref) => ref.asset_id !== asset.id),
                              { asset_id: asset.id, variant_id: selectedVariantId ?? defaultVariant?.id ?? null, role: asset.asset_type },
                            ]
                          : selectedAssetRefs.filter((ref) => ref.asset_id !== asset.id);
                        onSetAssetRefs(shot.id, next);
                      }}
                    />
                    <span className="truncate font-medium">{asset.name}</span>
                    <span className="text-muted-foreground">{asset.asset_type}</span>
                  </label>
                  {checked && variants.length > 0 && (
                    <div className="space-y-1.5">
                      {selectedVariant && (
                        <div className="flex items-center gap-2 rounded bg-muted/50 p-1.5">
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                            {selectedVariant.media_url ? (
                              <img
                                src={selectedVariant.media_url}
                                alt={selectedVariant.name ?? asset.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{selectedVariant.name ?? selectedVariant.source_kind}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {selectedVariant.status} · {selectedVariant.source_kind}
                              {selectedVariant.is_primary ? " · Primary" : ""}
                            </p>
                          </div>
                        </div>
                      )}
                      <Select
                        value={selectedVariantId ?? ""}
                        onValueChange={(variantId) => {
                          const next = [
                            ...selectedAssetRefs.filter((ref) => ref.asset_id !== asset.id),
                            { asset_id: asset.id, variant_id: variantId, role: asset.asset_type },
                          ];
                          onSetAssetRefs(shot.id, next);
                        }}
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue placeholder="Variant" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72 min-w-72">
                          {variants.map((variant) => (
                            <SelectItem key={variant.id} value={variant.id} className="py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">
                                  {variant.media_url ? (
                                    <img
                                      src={variant.media_url}
                                      alt={variant.name ?? asset.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                      <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs">{variant.name ?? variant.source_kind}</p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {variant.status} · {variant.source_kind}
                                    {variant.is_primary ? " · Primary" : ""}
                                  </p>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </InspectorSection>
      )}

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
        <div className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant={hasCompiledPromptForGeneration(shot.compiled_prompt) ? "secondary" : "outline"} className="text-[10px]">
            1
          </Badge>
          <span>Compile and review prompt</span>
          <Badge variant={shot.status === "generating" || shot.video_url ? "secondary" : "outline"} className="text-[10px]">
            2
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mb-2 w-full text-xs"
          onClick={() => onCompileVideoPrompt(shot.id)}
          disabled={!hasUsableShotVideoSource({ imageUrl: shot.image_url, selectedRefs: selectedAssetRefs })}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Compile Prompt
        </Button>
        <Textarea
          className="mb-2 min-h-[132px] text-xs resize-y"
          placeholder="Compile the video prompt before generating."
          value={shot.compiled_prompt || ""}
          onChange={(e) => onUpdateShot(shot.id, { compiled_prompt: e.target.value, prompt_override: e.target.value })}
        />
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
