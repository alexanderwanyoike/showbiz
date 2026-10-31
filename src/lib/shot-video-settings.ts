import {
  shotVideoSettingsSchema,
  type StoredShotVideoSettings,
} from "../../shared/shot-video-settings";
import type { Result } from "../../shared/result";
import type { VideoGenerationSettings, VideoModelInfo } from "./models/types";

function read(
  serialized: string | null | undefined,
): Result<StoredShotVideoSettings | null> {
  if (!serialized) return { ok: true, value: null };
  try {
    const parsed = shotVideoSettingsSchema.safeParse(JSON.parse(serialized));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message:
              "Saved video settings could not be read. Model defaults are shown.",
          },
        };
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          "Saved video settings could not be read. Model defaults are shown.",
      },
    };
  }
}
export function storeShotVideoSettings(
  model_id: string,
  settings: VideoGenerationSettings,
): StoredShotVideoSettings {
  return {
    model_id,
    settings: {
      duration: settings.duration,
      ...(settings.resolution ? { resolution: settings.resolution } : {}),
      ...(settings.aspectRatio ? { aspect_ratio: settings.aspectRatio } : {}),
      ...(settings.audio !== undefined ? { audio: settings.audio } : {}),
    },
  };
}
export function resolveShotVideoSettings(
  serialized: string | null | undefined,
  model: VideoModelInfo,
): {
  settings: VideoGenerationSettings;
  source: "saved" | "model-defaults";
  notice: string;
} {
  const parsed = read(serialized);
  const fallback = (notice: string) => ({
    settings: { ...model.defaults },
    source: "model-defaults" as const,
    notice,
  });
  if (!parsed.ok) return fallback(parsed.error.message);
  if (!parsed.value)
    return fallback("Using model defaults. Changes apply only to this shot.");
  if (parsed.value.model_id !== model.id)
    return fallback(
      `Using ${model.name} defaults. Saved settings belong to another model.`,
    );
  const saved = parsed.value.settings;
  const settings: VideoGenerationSettings = {
    ...model.defaults,
    duration: saved.duration,
    ...(saved.resolution ? { resolution: saved.resolution } : {}),
    ...(saved.aspect_ratio ? { aspectRatio: saved.aspect_ratio } : {}),
    ...(saved.audio !== undefined ? { audio: saved.audio } : {}),
  };
  if (
    !model.capabilities.durations.includes(settings.duration) ||
    (settings.resolution &&
      !model.capabilities.resolutions?.includes(settings.resolution)) ||
    (settings.aspectRatio &&
      !model.capabilities.aspectRatios?.includes(settings.aspectRatio)) ||
    (settings.audio !== undefined && !model.capabilities.hasAudio)
  )
    return fallback(
      "Saved video settings no longer match this model. Model defaults are shown.",
    );
  return { settings, source: "saved", notice: "Saved for this shot." };
}
