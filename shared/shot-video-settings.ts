import { z } from "zod";

export const shotVideoSettingsSchema = z.strictObject({
  model_id: z.string().trim().min(1).max(200),
  settings: z.strictObject({
    duration: z
      .string()
      .max(16)
      .refine(
        (value) =>
          value === "auto" ||
          (/^\d+s?$/.test(value) &&
            Number(value.replace(/s$/, "")) > 0 &&
            Number(value.replace(/s$/, "")) <= 3600),
      ),
    resolution: z.string().min(1).max(32).optional(),
    aspect_ratio: z.string().min(1).max(32).optional(),
    audio: z.boolean().optional(),
  }),
});
export type StoredShotVideoSettings = z.infer<typeof shotVideoSettingsSchema>;

type StoredSettings = StoredShotVideoSettings["settings"];
interface VideoCapabilities {
  durations: string[];
  resolutions?: string[];
  aspectRatios?: string[];
  hasAudio?: boolean;
}
const SETTING_LABELS: Record<keyof StoredSettings, string> = {
  duration: "duration",
  resolution: "resolution",
  aspect_ratio: "aspect ratio",
  audio: "audio",
};

/** The saved settings a model cannot use, in display order. */
export function unusableVideoSettings(
  settings: StoredSettings,
  capabilities: VideoCapabilities,
): (keyof StoredSettings)[] {
  return [
    ...(!capabilities.durations.includes(settings.duration) ? (["duration"] as const) : []),
    ...(settings.resolution !== undefined && !capabilities.resolutions?.includes(settings.resolution)
      ? (["resolution"] as const)
      : []),
    ...(settings.aspect_ratio !== undefined && !capabilities.aspectRatios?.includes(settings.aspect_ratio)
      ? (["aspect_ratio"] as const)
      : []),
    ...(settings.audio !== undefined && !capabilities.hasAudio ? (["audio"] as const) : []),
  ];
}

export function videoSettingNames(keys: (keyof StoredSettings)[]): string {
  const labels = keys.map((key) => SETTING_LABELS[key]);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : (labels[0] ?? "");
}
