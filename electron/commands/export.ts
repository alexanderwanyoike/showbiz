import path from "node:path";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import {
  buildExportPlan,
  buildFfmpegArgs,
  runFfmpegExport,
  type ExportClip,
  type ExportProgress,
  type ExportSettings,
  type SpawnFn,
} from "../export";

/**
 * Native ffmpeg timeline export for the Electron shell. The renderer's clip
 * URLs are blob: URLs under Electron and useless to the main process, so the
 * main process resolves every clip's source file from the DB here: a pinned
 * video_versions.video_path, else the shot's current shots.video_path, joined
 * onto the media base dir. All ffmpeg/electron dependencies are injected so the
 * unit tests need neither.
 */

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface ProbeResult {
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export interface ExportDeps {
  spawn: SpawnFn;
  ffmpegPath: string;
  ffprobePath?: string;
  showSaveDialog: (opts: {
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<SaveDialogResult>;
  onProgress: (progress: ExportProgress) => void;
  /** Optional ffprobe-backed probe for default settings + audio detection. */
  probeVideo?: (filePath: string) => Promise<ProbeResult>;
}

interface PayloadClip {
  shotId: string;
  videoVersionId: string | null;
  track: string;
  trimIn: number;
  trimOut: number;
  startOffset: number;
}

const DEFAULT_PRESET = "medium";
const FALLBACK_SETTINGS = { width: 1920, height: 1080, fps: 30 };

export function createExportCommands(
  db: DatabaseSync,
  mediaDir: string,
  deps: ExportDeps
) {
  /** Resolve a clip's absolute source-video path from the DB, or throw. */
  function resolveClipPath(clip: PayloadClip): string {
    let relativePath: string | null;
    if (clip.videoVersionId) {
      const row = db
        .prepare("SELECT video_path FROM video_versions WHERE id = ?")
        .get(clip.videoVersionId) as { video_path: string | null } | undefined;
      relativePath = row?.video_path ?? null;
      if (!relativePath) {
        throw new Error(`No video file for pinned version ${clip.videoVersionId}`);
      }
    } else {
      const row = db
        .prepare("SELECT video_path FROM shots WHERE id = ?")
        .get(clip.shotId) as { video_path: string | null } | undefined;
      relativePath = row?.video_path ?? null;
      if (!relativePath) {
        throw new Error(`No video file for shot ${clip.shotId}`);
      }
    }

    const absolute = path.join(mediaDir, relativePath);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Video file not found: ${absolute}`);
    }
    return absolute;
  }

  /** Fill missing width/height/fps by probing the first clip; preset defaults to medium. */
  async function resolveSettings(
    requested: Partial<ExportSettings>,
    firstFilePath: string
  ): Promise<ExportSettings> {
    const preset = requested.preset ?? DEFAULT_PRESET;
    if (requested.width && requested.height && requested.fps) {
      return { width: requested.width, height: requested.height, fps: requested.fps, preset };
    }

    let probed = FALLBACK_SETTINGS;
    if (deps.probeVideo) {
      try {
        const result = await deps.probeVideo(firstFilePath);
        probed = { width: result.width, height: result.height, fps: result.fps };
      } catch {
        // Fall back to sane defaults when probing fails.
      }
    }
    return {
      width: requested.width ?? probed.width,
      height: requested.height ?? probed.height,
      fps: requested.fps ?? probed.fps,
      preset,
    };
  }

  return {
    async show_export_save_dialog(): Promise<string | null> {
      const result = await deps.showSaveDialog({
        defaultPath: "edited-video.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });
      return result.canceled || !result.filePath ? null : result.filePath;
    },

    async export_timeline_video(
      args?: Record<string, unknown>
    ): Promise<{ savePath: string }> {
      const clips = (args?.clips ?? []) as PayloadClip[];
      const savePath = args?.savePath as string | undefined;
      const requested = (args?.settings ?? {}) as Partial<ExportSettings>;

      if (!savePath) {
        throw new Error("export_timeline_video requires a savePath");
      }
      if (clips.length === 0) {
        throw new Error("No clips to export");
      }

      const resolved: ExportClip[] = [];
      for (const clip of clips) {
        const filePath = resolveClipPath(clip);
        let hasAudio = true;
        if (deps.probeVideo) {
          try {
            hasAudio = (await deps.probeVideo(filePath)).hasAudio;
          } catch {
            hasAudio = true;
          }
        }
        resolved.push({
          filePath,
          track: clip.track,
          trimIn: clip.trimIn,
          trimOut: clip.trimOut,
          startOffset: clip.startOffset,
          hasAudio,
        });
      }

      const settings = await resolveSettings(requested, resolved[0].filePath);
      const plan = buildExportPlan(resolved);
      const ffmpegArgs = buildFfmpegArgs(plan, settings, savePath);

      await runFfmpegExport(deps.ffmpegPath, ffmpegArgs, plan.totalDuration, {
        spawn: deps.spawn,
        onProgress: deps.onProgress,
      });

      return { savePath };
    },
  };
}
