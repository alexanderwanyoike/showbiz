import { app, dialog, BrowserWindow } from "electron";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { createExportCommands, type ProbeResult } from "./commands/export";
import { ffmpegBinaryPath, ffprobeBinaryPath, type ExportProgress } from "./export";

const execFileAsync = promisify(execFile);

/** Parse ffprobe's "num/den" frame-rate string into fps (defaults to 30). */
function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 30;
  const [num, den] = raw.split("/").map(Number);
  if (!num || !den) return Number(num) || 30;
  return num / den;
}

/** Probe a video's first video-stream resolution/fps and audio presence via ffprobe. */
async function probeVideo(ffprobePath: string, filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[];
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  return {
    width: video?.width ?? 1920,
    height: video?.height ?? 1080,
    fps: Math.round(parseFrameRate(video?.r_frame_rate)),
    hasAudio,
  };
}

/**
 * Wire the native export commands with their production Electron/node/ffmpeg
 * dependencies. Kept out of main.ts (and out of the injectable command module)
 * so that module stays electron-free and unit-testable.
 */
export function createExportCommandsForApp(db: DatabaseSync, mediaDir: string) {
  const appPath = app.getAppPath();
  const ffmpegPath = ffmpegBinaryPath(appPath);
  const ffprobePath = ffprobeBinaryPath(appPath);

  return createExportCommands(db, mediaDir, {
    spawn: (command, args) => spawn(command, args),
    ffmpegPath,
    ffprobePath,
    showSaveDialog: (opts) =>
      dialog.showSaveDialog({ defaultPath: opts.defaultPath, filters: opts.filters }),
    onProgress: (payload: ExportProgress) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("showbiz:export-progress", payload);
      }
    },
    probeVideo: (filePath) => probeVideo(ffprobePath, filePath),
  });
}
