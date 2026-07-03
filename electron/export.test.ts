import { describe, it, expect, vi } from "vitest";
import {
  buildExportPlan,
  buildFfmpegArgs,
  computeProgressPercent,
  runFfmpegExport,
  ffmpegBinaryPath,
  ffprobeBinaryPath,
  type ExportClip,
  type ExportSettings,
  type ChildProcessLike,
} from "./export";

const SETTINGS: ExportSettings = { width: 1280, height: 720, fps: 30, preset: "medium" };

// Independent restatement of the normalization chains (the spec), so an
// accidental edit to the implementation strings fails the argv assertions.
function vChain(src: string, label: string, s = SETTINGS): string {
  return (
    `[${src}]scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,` +
    `pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${s.fps},format=yuv420p[${label}]`
  );
}
function aChain(src: string, label: string): string {
  return `[${src}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[${label}]`;
}

describe("buildExportPlan", () => {
  it("orders clips by startOffset then track priority (parity with orderClipsForExport)", () => {
    // Same startOffset: higher video track wins, video outranks audio.
    const clips: ExportClip[] = [
      { filePath: "/a1.mp4", track: "A1", trimIn: 0, trimOut: 1, startOffset: 0 },
      { filePath: "/v2.mp4", track: "V2", trimIn: 0, trimOut: 1, startOffset: 0 },
      { filePath: "/v1.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 },
    ];
    const plan = buildExportPlan(clips);
    const files = plan.segments
      .filter((s) => s.kind === "clip")
      .map((s) => (s.kind === "clip" ? s.filePath : ""));
    expect(files).toEqual(["/v2.mp4", "/v1.mp4", "/a1.mp4"]);
  });

  it("keeps later-starting clips after earlier ones regardless of input order", () => {
    const clips: ExportClip[] = [
      { filePath: "/late.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 10 },
      { filePath: "/early.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 1 },
    ];
    const plan = buildExportPlan(clips);
    const clipFiles = plan.segments
      .filter((s): s is Extract<typeof s, { kind: "clip" }> => s.kind === "clip")
      .map((s) => s.filePath);
    expect(clipFiles).toEqual(["/early.mp4", "/late.mp4"]);
  });

  it("computes clip duration from the trim window", () => {
    const plan = buildExportPlan([
      { filePath: "/a.mp4", track: "V1", trimIn: 1.5, trimOut: 4.0, startOffset: 0 },
    ]);
    expect(plan.segments).toEqual([
      { kind: "clip", filePath: "/a.mp4", trimIn: 1.5, trimOut: 4.0, duration: 2.5, hasAudio: true },
    ]);
    expect(plan.totalDuration).toBe(2.5);
  });

  it("inserts a black gap for dead time between clips", () => {
    // A ends at 2 (offset 0 + dur 2), B starts at 3 => 1s gap.
    const plan = buildExportPlan([
      { filePath: "/a.mp4", track: "V1", trimIn: 0, trimOut: 2, startOffset: 0 },
      { filePath: "/b.mp4", track: "V1", trimIn: 0, trimOut: 2, startOffset: 3 },
    ]);
    expect(plan.segments.map((s) => s.kind)).toEqual(["clip", "gap", "clip"]);
    const gap = plan.segments[1];
    expect(gap).toEqual({ kind: "gap", duration: 1 });
    expect(plan.totalDuration).toBe(5);
  });

  it("includes a leading gap when the first clip starts after zero", () => {
    const plan = buildExportPlan([
      { filePath: "/a.mp4", track: "V1", trimIn: 0, trimOut: 2, startOffset: 2.5 },
    ]);
    expect(plan.segments[0]).toEqual({ kind: "gap", duration: 2.5 });
    expect(plan.segments[1].kind).toBe("clip");
    expect(plan.totalDuration).toBe(4.5);
  });

  it("emits no gap for exactly-adjacent clips (zero gap)", () => {
    const plan = buildExportPlan([
      { filePath: "/a.mp4", track: "V1", trimIn: 0, trimOut: 2, startOffset: 0 },
      { filePath: "/b.mp4", track: "V1", trimIn: 0, trimOut: 2, startOffset: 2 },
    ]);
    expect(plan.segments.map((s) => s.kind)).toEqual(["clip", "clip"]);
  });

  it("does not emit a spurious gap after an overlap", () => {
    // B overlaps A (starts before A ends); C is adjacent to A's end.
    const plan = buildExportPlan([
      { filePath: "/a.mp4", track: "V1", trimIn: 0, trimOut: 4, startOffset: 0 },
      { filePath: "/b.mp4", track: "V2", trimIn: 0, trimOut: 1, startOffset: 2 },
      { filePath: "/c.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 4 },
    ]);
    expect(plan.segments.every((s) => s.kind === "clip")).toBe(true);
  });

  it("defaults hasAudio to true and preserves an explicit false", () => {
    const plan = buildExportPlan([
      { filePath: "/a.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 },
      { filePath: "/b.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 1, hasAudio: false },
    ]);
    const clips = plan.segments.filter((s) => s.kind === "clip");
    expect(clips.map((s) => (s.kind === "clip" ? s.hasAudio : null))).toEqual([true, false]);
  });
});

describe("buildFfmpegArgs", () => {
  it("builds the full argv for two trimmed clips with a gap", () => {
    const plan = buildExportPlan([
      { filePath: "/media/a.mp4", track: "V1", trimIn: 1.0, trimOut: 3.0, startOffset: 0 },
      { filePath: "/media/b.mp4", track: "V1", trimIn: 0.5, trimOut: 2.5, startOffset: 3 },
    ]);
    const args = buildFfmpegArgs(plan, SETTINGS, "/media/out.mp4");

    const filterComplex =
      [
        vChain("0:v", "v0"),
        aChain("0:a", "a0"),
        vChain("1:v", "v1"),
        aChain("2:a", "a1"),
        vChain("3:v", "v2"),
        aChain("3:a", "a2"),
      ].join(";") +
      ";" +
      "[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[outv][outa]";

    expect(args).toEqual([
      "-hide_banner",
      "-y",
      "-ss", "1.000", "-to", "3.000", "-i", "/media/a.mp4",
      "-f", "lavfi", "-t", "1.000", "-i", "color=c=black:s=1280x720:r=30",
      "-f", "lavfi", "-t", "1.000", "-i", "anullsrc=r=48000:cl=stereo",
      "-ss", "0.500", "-to", "2.500", "-i", "/media/b.mp4",
      "-filter_complex", filterComplex,
      "-map", "[outv]", "-map", "[outa]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-nostats",
      "/media/out.mp4",
    ]);
  });

  it("threads resolution, fps and preset through the graph and codecs", () => {
    const settings: ExportSettings = { width: 1920, height: 1080, fps: 24, preset: "veryfast" };
    const plan = buildExportPlan([
      { filePath: "/x.mp4", track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 },
    ]);
    const args = buildFfmpegArgs(plan, settings, "/out.mp4");
    const fc = args[args.indexOf("-filter_complex") + 1];

    expect(fc).toContain("scale=1920:1080:force_original_aspect_ratio=decrease");
    expect(fc).toContain("fps=24");
    expect(args[args.indexOf("-preset") + 1]).toBe("veryfast");
  });

  it("gives a clip with no audio stream a silent anullsrc input", () => {
    const plan = buildExportPlan([
      { filePath: "/silent.mp4", track: "V1", trimIn: 0, trimOut: 2, startOffset: 0, hasAudio: false },
    ]);
    const args = buildFfmpegArgs(plan, SETTINGS, "/out.mp4");

    // Two inputs: the video file (0) and a silence source (1); audio maps [1:a].
    expect(args).toEqual([
      "-hide_banner",
      "-y",
      "-ss", "0.000", "-to", "2.000", "-i", "/silent.mp4",
      "-f", "lavfi", "-t", "2.000", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex",
      [vChain("0:v", "v0"), aChain("1:a", "a0")].join(";") +
        ";" +
        "[v0][a0]concat=n=1:v=1:a=1[outv][outa]",
      "-map", "[outv]", "-map", "[outa]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-nostats",
      "/out.mp4",
    ]);
  });
});

describe("computeProgressPercent", () => {
  it("maps out_time_us against the total duration", () => {
    expect(computeProgressPercent(2_500_000, 5)).toBe(50);
  });
  it("clamps to [0, 100]", () => {
    expect(computeProgressPercent(10_000_000, 5)).toBe(100);
    expect(computeProgressPercent(-5, 5)).toBe(0);
  });
  it("returns 0 for a non-positive total", () => {
    expect(computeProgressPercent(1_000_000, 0)).toBe(0);
  });
});

describe("runFfmpegExport", () => {
  function fakeChild(): {
    child: ChildProcessLike;
    emitStdout: (s: string) => void;
    emitStderr: (s: string) => void;
    close: (code: number) => void;
    error: (e: Error) => void;
  } {
    const handlers: Record<string, (arg: unknown) => void> = {};
    const stdoutHandlers: ((c: unknown) => void)[] = [];
    const stderrHandlers: ((c: unknown) => void)[] = [];
    const child: ChildProcessLike = {
      stdout: { on: (_e, cb) => stdoutHandlers.push(cb) },
      stderr: { on: (_e, cb) => stderrHandlers.push(cb) },
      on: (event, cb) => {
        handlers[event] = cb as (arg: unknown) => void;
      },
    };
    return {
      child,
      emitStdout: (s) => stdoutHandlers.forEach((cb) => cb(s)),
      emitStderr: (s) => stderrHandlers.forEach((cb) => cb(s)),
      close: (code) => handlers.close?.(code),
      error: (e) => handlers.error?.(e),
    };
  }

  it("resolves on exit 0 and reports progress plus a final 100%", async () => {
    const rig = fakeChild();
    const onProgress = vi.fn();
    const promise = runFfmpegExport("ffmpeg", ["-i", "x"], 10, {
      spawn: () => rig.child,
      onProgress,
    });

    rig.emitStdout("frame=1\nout_time_us=5000000\nprogress=continue\n");
    rig.close(0);
    await expect(promise).resolves.toBeUndefined();

    expect(onProgress).toHaveBeenCalledWith({ percent: 50 });
    expect(onProgress).toHaveBeenLastCalledWith({ percent: 100 });
  });

  it("rejects with the stderr tail on a non-zero exit", async () => {
    const rig = fakeChild();
    const promise = runFfmpegExport("ffmpeg", [], 10, { spawn: () => rig.child });
    rig.emitStderr("boom: bad filter\n");
    rig.close(1);
    await expect(promise).rejects.toThrow(/code 1: boom: bad filter/);
  });
});

describe("binary path resolution", () => {
  it("resolves the ffmpeg-static binary under node_modules", () => {
    expect(ffmpegBinaryPath("/app", "linux")).toBe("/app/node_modules/ffmpeg-static/ffmpeg");
    expect(ffmpegBinaryPath("/app", "win32")).toBe("/app/node_modules/ffmpeg-static/ffmpeg.exe");
  });

  it("resolves the ffprobe-static binary by platform and arch", () => {
    expect(ffprobeBinaryPath("/app", "linux", "x64")).toBe(
      "/app/node_modules/ffprobe-static/bin/linux/x64/ffprobe"
    );
    expect(ffprobeBinaryPath("/app", "win32", "x64")).toBe(
      "/app/node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe"
    );
  });

  it("resolves packaged binaries from resources/bin when a resourcesPath is given", () => {
    expect(ffmpegBinaryPath("/ignored", "linux", "/opt/Showbiz/resources")).toBe(
      "/opt/Showbiz/resources/bin/ffmpeg"
    );
    expect(ffmpegBinaryPath("/ignored", "win32", "/resources")).toBe("/resources/bin/ffmpeg.exe");
    expect(ffprobeBinaryPath("/ignored", "linux", "x64", "/opt/Showbiz/resources")).toBe(
      "/opt/Showbiz/resources/bin/ffprobe"
    );
    expect(ffprobeBinaryPath("/ignored", "win32", "x64", "/resources")).toBe(
      "/resources/bin/ffprobe.exe"
    );
  });
});
