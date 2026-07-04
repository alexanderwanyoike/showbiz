import path from "node:path";

/**
 * Native ffmpeg export planning and argv construction. Pure and unit-testable:
 * no electron, no child_process, no filesystem. The Electron command module
 * (commands/export.ts) resolves file paths from the DB and feeds resolved clips
 * in here, then spawns ffmpeg with the argv this produces.
 */

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  /** libx264 preset, e.g. "medium", "fast", "veryslow". */
  preset: string;
}

/** A resolved timeline clip ready for planning (file path already looked up). */
export interface ExportClip {
  /** Absolute path to the source video file. */
  filePath: string;
  /** Timeline track id (e.g. "V1"), used only for the ordering tiebreak. */
  track: string;
  /** Trim window, in source-file seconds. */
  trimIn: number;
  trimOut: number;
  /** Timeline start position, in seconds. */
  startOffset: number;
  /** Whether the source has an audio stream. Defaults to true when omitted. */
  hasAudio?: boolean;
}

export interface ClipSegment {
  kind: "clip";
  filePath: string;
  trimIn: number;
  trimOut: number;
  duration: number;
  hasAudio: boolean;
}

export interface GapSegment {
  kind: "gap";
  duration: number;
}

export type ExportSegment = ClipSegment | GapSegment;

export interface ExportPlan {
  segments: ExportSegment[];
  /** Sum of every segment duration; the denominator for progress. */
  totalDuration: number;
}

export interface ExportProgress {
  percent: number;
}

/** Below this many seconds a gap is treated as zero (float noise / adjacency). */
const GAP_EPSILON = 1e-3;

/** Common audio format for concat: 48 kHz stereo, matching anullsrc gaps. */
const AUDIO_SAMPLE_RATE = 48000;

/**
 * Track priority, mirroring src/lib/timeline-utils.ts trackPriority so export
 * ordering matches orderClipsForExport: video tracks (V*) outrank audio (A*),
 * higher numbers win within a type.
 */
function trackPriority(trackId: string): number {
  const isVideo = trackId.startsWith("V");
  const num = parseInt(trackId.slice(1), 10) || 0;
  return (isVideo ? 1000 : 0) + num;
}

/** Format a seconds value for ffmpeg argv: fixed 3 decimals, stable across runs. */
function fmt(seconds: number): string {
  return seconds.toFixed(3);
}

/**
 * Build the ordered segment plan from resolved clips. Clips are ordered by
 * timeline position (startOffset ascending), breaking ties by track priority
 * descending, exactly like orderClipsForExport. Dead time between one clip's
 * end (startOffset + effectiveDuration) and the next clip's startOffset becomes
 * a black gap segment; a leading gap before the first clip (startOffset > 0) is
 * included.
 *
 * Known limitation (issue #77): overlapping clips across tracks concatenate
 * back-to-back instead of the preview's track-priority splice, matching the
 * legacy wasm exporter.
 */
export function buildExportPlan(clips: ExportClip[]): ExportPlan {
  const ordered = [...clips].sort((a, b) => {
    const timeDiff = a.startOffset - b.startOffset;
    if (timeDiff !== 0) return timeDiff;
    return trackPriority(b.track) - trackPriority(a.track);
  });

  const segments: ExportSegment[] = [];
  let cursor = 0;

  for (const clip of ordered) {
    const gap = clip.startOffset - cursor;
    if (gap > GAP_EPSILON) {
      segments.push({ kind: "gap", duration: gap });
    }
    const duration = clip.trimOut - clip.trimIn;
    segments.push({
      kind: "clip",
      filePath: clip.filePath,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      duration,
      hasAudio: clip.hasAudio ?? true,
    });
    // Monotonic cursor: overlaps (startOffset < cursor) never rewind the
    // timeline, so they concatenate back-to-back with no spurious gap.
    cursor = Math.max(cursor, clip.startOffset + duration);
  }

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  return { segments, totalDuration };
}

function videoChain(src: string, label: string, s: ExportSettings): string {
  return (
    `[${src}]scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,` +
    `pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${s.fps},format=yuv420p[${label}]`
  );
}

function audioChain(src: string, label: string): string {
  return `[${src}]aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo[${label}]`;
}

/**
 * Build the complete ffmpeg argv for a plan. Each clip is an input trimmed with
 * input-seek -ss/-to; gaps are lavfi color=black + anullsrc inputs; clips
 * without an audio stream get an anullsrc silence input so every concat pair
 * has both [v] and [a]. All video is normalized to the output resolution/fps
 * and all audio to 48 kHz stereo before a single concat filter joins them.
 */
export function buildFfmpegArgs(
  plan: ExportPlan,
  settings: ExportSettings,
  savePath: string
): string[] {
  const inputs: string[] = [];
  const filters: string[] = [];
  const concatPairs: string[] = [];
  let inputIndex = 0;

  plan.segments.forEach((seg, segIndex) => {
    const vLabel = `v${segIndex}`;
    const aLabel = `a${segIndex}`;

    if (seg.kind === "clip") {
      const vIdx = inputIndex++;
      inputs.push("-ss", fmt(seg.trimIn), "-to", fmt(seg.trimOut), "-i", seg.filePath);
      filters.push(videoChain(`${vIdx}:v`, vLabel, settings));

      if (seg.hasAudio) {
        filters.push(audioChain(`${vIdx}:a`, aLabel));
      } else {
        const aIdx = inputIndex++;
        inputs.push(
          "-f",
          "lavfi",
          "-t",
          fmt(seg.duration),
          "-i",
          `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`
        );
        filters.push(audioChain(`${aIdx}:a`, aLabel));
      }
    } else {
      const vIdx = inputIndex++;
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        fmt(seg.duration),
        "-i",
        `color=c=black:s=${settings.width}x${settings.height}:r=${settings.fps}`
      );
      const aIdx = inputIndex++;
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        fmt(seg.duration),
        "-i",
        `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`
      );
      filters.push(videoChain(`${vIdx}:v`, vLabel, settings));
      filters.push(audioChain(`${aIdx}:a`, aLabel));
    }

    concatPairs.push(`[${vLabel}][${aLabel}]`);
  });

  const n = plan.segments.length;
  const filterComplex =
    filters.join(";") + ";" + concatPairs.join("") + `concat=n=${n}:v=1:a=1[outv][outa]`;

  return [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    settings.preset,
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    savePath,
  ];
}

/** Clamp ffmpeg's out_time_us against the plan total to a 0-100 percentage. */
export function computeProgressPercent(outTimeUs: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  const percent = (outTimeUs / 1_000_000 / totalSeconds) * 100;
  return Math.max(0, Math.min(100, percent));
}

// -- spawn wrapper (thin, injectable) --

export interface ChildProcessLike {
  stdout: { on(event: "data", cb: (chunk: unknown) => void): void } | null;
  stderr: { on(event: "data", cb: (chunk: unknown) => void): void } | null;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: (code: number | null) => void): void;
}

export type SpawnFn = (command: string, args: string[]) => ChildProcessLike;

export interface RunFfmpegDeps {
  spawn: SpawnFn;
  onProgress?: (progress: ExportProgress) => void;
}

/**
 * Spawn ffmpeg and resolve when it exits 0, rejecting with the stderr tail
 * otherwise. Progress comes from ffmpeg's `-progress pipe:1` stream on stdout
 * (out_time_us lines) measured against the plan's total duration.
 */
export function runFfmpegExport(
  ffmpegPath: string,
  args: string[],
  totalSeconds: number,
  deps: RunFfmpegDeps
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = deps.spawn(ffmpegPath, args);
    let stdoutBuffer = "";
    let stderrTail = "";

    child.stdout?.on("data", (chunk) => {
      stdoutBuffer += String(chunk);
      let newlineIndex: number;
      while ((newlineIndex = stdoutBuffer.indexOf("\n")) !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        const match = line.match(/^out_time_us=(\d+)/);
        if (match) {
          deps.onProgress?.({
            percent: computeProgressPercent(Number(match[1]), totalSeconds),
          });
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      stderrTail = (stderrTail + String(chunk)).slice(-4000);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        deps.onProgress?.({ percent: 100 });
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail.trim()}`));
      }
    });
  });
}

// -- static binary path resolution --

/**
 * Path to the ffmpeg binary. Dev: ships in node_modules via ffmpeg-static.
 * Packaged: electron-builder copies it to resources/bin (extraResources), so
 * callers pass process.resourcesPath as resourcesPath.
 */
export function ffmpegBinaryPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
  resourcesPath?: string
): string {
  const name = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  if (resourcesPath) return path.join(resourcesPath, "bin", name);
  return path.join(appPath, "node_modules", "ffmpeg-static", name);
}

/**
 * Path to the ffprobe binary (used to probe default resolution/fps and audio
 * presence). Same dev/packaged split as ffmpegBinaryPath.
 */
export function ffprobeBinaryPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  resourcesPath?: string
): string {
  const name = platform === "win32" ? "ffprobe.exe" : "ffprobe";
  if (resourcesPath) return path.join(resourcesPath, "bin", name);
  return path.join(appPath, "node_modules", "ffprobe-static", "bin", platform, arch, name);
}
