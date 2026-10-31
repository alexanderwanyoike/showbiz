import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDurationLabel } from "../lib/video-preview";
import type {
  VideoGenerationSettings,
  VideoModelInfo,
} from "../lib/models/types";

export function ShotVideoSettings({
  videoModel,
  videoSettings,
  onVideoSettingsChange,
  videoSettingsSaving,
}: {
  videoModel: VideoModelInfo | null;
  videoSettings: VideoGenerationSettings;
  onVideoSettingsChange: (settings: VideoGenerationSettings) => void;
  videoSettingsSaving: boolean;
}) {
  const id = useId();
  if (!videoModel) return null;
  const fields: {
    key: "duration" | "resolution" | "aspectRatio";
    label: string;
    accessibleName: string;
    options: string[];
    format: (value: string) => string;
  }[] = [
    {
      key: "duration",
      label: "Duration",
      accessibleName: "Video duration",
      options: videoModel.capabilities.durations,
      format: formatDurationLabel,
    },
    {
      key: "resolution",
      label: "Resolution",
      accessibleName: "Video resolution",
      options: videoModel.capabilities.resolutions ?? [],
      format: (value) => value,
    },
    {
      key: "aspectRatio",
      label: "Aspect ratio",
      accessibleName: "Video aspect ratio",
      options: videoModel.capabilities.aspectRatios ?? [],
      format: (value) => (value === "auto" ? "Auto" : value),
    },
  ];
  return (
    <div className="shot-output-settings">
      {fields
        .filter((field) => field.options.length > 0)
        .map((field) => {
          const value = videoSettings[field.key] ?? field.options[0];
          const fieldId = `${id}-${field.key}`;
          return (
            <div className="shot-output-field" key={field.key}>
              <label htmlFor={fieldId} className="shot-output-label">
                {field.label}
              </label>
              {field.options.length === 1 ? (
                <output
                  id={fieldId}
                  aria-label={field.accessibleName}
                  className="shot-output-value text-xs"
                >
                  {field.format(value)}
                </output>
              ) : (
                <Select
                  value={value}
                  disabled={videoSettingsSaving}
                  onValueChange={(next) =>
                    onVideoSettingsChange({
                      ...videoSettings,
                      [field.key]: next,
                    })
                  }
                >
                  <SelectTrigger
                    id={fieldId}
                    aria-label={field.accessibleName}
                    className="shot-output-select text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {field.format(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      {videoModel.capabilities.hasAudio && (
        <div className="shot-output-field">
          <label htmlFor={`${id}-audio`} className="shot-output-label">
            Audio
          </label>
          <Switch
            id={`${id}-audio`}
            aria-label="Generate audio"
            checked={videoSettings.audio ?? false}
            disabled={videoSettingsSaving}
            onCheckedChange={(audio) =>
              onVideoSettingsChange({ ...videoSettings, audio })
            }
          />
        </div>
      )}
    </div>
  );
}
