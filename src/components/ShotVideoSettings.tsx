import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDurationLabel } from "../lib/video-preview";
import type { VideoGenerationSettings, VideoModelInfo } from "../lib/models/types";

export function ShotVideoSettings({videoModel,videoSettings,onVideoSettingsChange,videoSettingsSaving}: {
 videoModel: VideoModelInfo | null;
 videoSettings: VideoGenerationSettings;
 onVideoSettingsChange: (settings:VideoGenerationSettings)=>void;
 videoSettingsSaving: boolean;
}) {
 if(!videoModel) return null;
  const hasVideoSettings =
    !!videoModel &&
    (videoModel.capabilities.durations.length > 1 ||
      (videoModel.capabilities.resolutions?.length ?? 0) > 1 ||
      (videoModel.capabilities.aspectRatios?.length ?? 0) > 1 ||
      videoModel.capabilities.hasAudio === true);
 return (
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
                    <Select disabled={videoSettingsSaving}
                      value={videoSettings.duration}
                      onValueChange={(duration) => onVideoSettingsChange({ ...videoSettings, duration })}
                    >
                      <SelectTrigger aria-label="Video duration" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {videoModel.capabilities.durations.map((duration) => (
                          <SelectItem key={duration} value={duration}>
                            {formatDurationLabel(duration)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(videoModel.capabilities.resolutions?.length ?? 0) > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Resolution</label>
                    <Select disabled={videoSettingsSaving}
                      value={videoSettings.resolution ?? ""}
                      onValueChange={(resolution) => onVideoSettingsChange({ ...videoSettings, resolution })}
                    >
                      <SelectTrigger aria-label="Video resolution" className="h-8 text-xs">
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
                    <Select disabled={videoSettingsSaving}
                      value={videoSettings.aspectRatio ?? ""}
                      onValueChange={(aspectRatio) => onVideoSettingsChange({ ...videoSettings, aspectRatio })}
                    >
                      <SelectTrigger aria-label="Video aspect ratio" className="h-8 text-xs">
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
                    <Switch disabled={videoSettingsSaving} aria-label="Generate audio"
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
 );
}
