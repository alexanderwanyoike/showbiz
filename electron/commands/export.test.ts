import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { generateId } from "../db";
import { createExportCommands, type ExportDeps } from "./export";
import type { ChildProcessLike } from "../export";

function tmpMediaDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-export-"));
}

/** A spawn stub that captures argv and immediately exits 0. */
function captureSpawn(sink: { cmd?: string; args?: string[] }) {
  return (cmd: string, args: string[]): ChildProcessLike => {
    sink.cmd = cmd;
    sink.args = args;
    const closeHandlers: ((code: number | null) => void)[] = [];
    const child: ChildProcessLike = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (event, cb) => {
        if (event === "close") {
          closeHandlers.push(cb as (code: number | null) => void);
          // Fire after the synchronous .on() wiring completes.
          setTimeout(() => closeHandlers.forEach((h) => h(0)), 0);
        }
      },
    };
    return child;
  };
}

function baseDeps(overrides: Partial<ExportDeps> = {}): ExportDeps {
  return {
    spawn: () => {
      throw new Error("spawn not configured");
    },
    ffmpegPath: "/bin/ffmpeg",
    showSaveDialog: async () => ({ canceled: true }),
    onProgress: () => {},
    ...overrides,
  };
}

const FULL_SETTINGS = { width: 1280, height: 720, fps: 30, preset: "medium" };

function seedShot(db: DatabaseSync, videoPath: string | null): string {
  const projId = generateId("proj");
  const sbId = generateId("sb");
  const shotId = generateId("shot");
  db.prepare("INSERT INTO projects (id, name) VALUES (?, 'P')").run(projId);
  db.prepare("INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, 'SB')").run(sbId, projId);
  db.prepare(
    `INSERT INTO shots (id, storyboard_id, "order", status, video_path) VALUES (?, ?, 1, 'complete', ?)`
  ).run(shotId, sbId, videoPath);
  return shotId;
}

function seedVersion(db: DatabaseSync, shotId: string, videoPath: string): string {
  const verId = generateId("vidver");
  db.prepare(
    `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
     VALUES (?, ?, 1, 'generation', ?, 1)`
  ).run(verId, shotId, videoPath);
  return verId;
}

function writeMediaFile(mediaDir: string, relativePath: string): string {
  const abs = path.join(mediaDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "fake-video-bytes");
  return abs;
}

describe("export_timeline_video path resolution", () => {
  it("resolves the shot's current video for an unpinned clip", async () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const shotId = seedShot(db, "videos/shot.mp4");
    const abs = writeMediaFile(mediaDir, "videos/shot.mp4");

    const sink: { cmd?: string; args?: string[] } = {};
    const commands = createExportCommands(
      db,
      mediaDir,
      baseDeps({ spawn: captureSpawn(sink) })
    );

    const result = await commands.export_timeline_video({
      clips: [
        { shotId, videoVersionId: null, track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 },
      ],
      settings: FULL_SETTINGS,
      savePath: "/out.mp4",
    });

    expect(result).toEqual({ savePath: "/out.mp4" });
    expect(sink.cmd).toBe("/bin/ffmpeg");
    expect(sink.args).toContain(abs);
    expect(sink.args).toContain("/out.mp4");
  });

  it("resolves the pinned version's video over the shot's current video", async () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const shotId = seedShot(db, "videos/shot.mp4");
    const versionId = seedVersion(db, shotId, "videos/versions/shot/v1.mp4");
    writeMediaFile(mediaDir, "videos/shot.mp4");
    const versionAbs = writeMediaFile(mediaDir, "videos/versions/shot/v1.mp4");

    const sink: { cmd?: string; args?: string[] } = {};
    const commands = createExportCommands(
      db,
      mediaDir,
      baseDeps({ spawn: captureSpawn(sink) })
    );

    await commands.export_timeline_video({
      clips: [
        { shotId, videoVersionId: versionId, track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 },
      ],
      settings: FULL_SETTINGS,
      savePath: "/out.mp4",
    });

    expect(sink.args).toContain(versionAbs);
    expect(sink.args).not.toContain(path.join(mediaDir, "videos/shot.mp4"));
  });

  it("rejects when the shot has no video path", async () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const shotId = seedShot(db, null);

    const commands = createExportCommands(db, mediaDir, baseDeps());
    await expect(
      commands.export_timeline_video({
        clips: [{ shotId, videoVersionId: null, track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 }],
        settings: FULL_SETTINGS,
        savePath: "/out.mp4",
      })
    ).rejects.toThrow(/No video file for shot/);
  });

  it("rejects when the resolved file is missing on disk", async () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const shotId = seedShot(db, "videos/missing.mp4");

    const commands = createExportCommands(db, mediaDir, baseDeps());
    await expect(
      commands.export_timeline_video({
        clips: [{ shotId, videoVersionId: null, track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 }],
        settings: FULL_SETTINGS,
        savePath: "/out.mp4",
      })
    ).rejects.toThrow(/Video file not found/);
  });

  it("rejects an empty clip list and a missing savePath", async () => {
    const db = openTestDb();
    const commands = createExportCommands(db, tmpMediaDir(), baseDeps());
    await expect(
      commands.export_timeline_video({ clips: [], settings: FULL_SETTINGS, savePath: "/out.mp4" })
    ).rejects.toThrow(/No clips/);
    await expect(
      commands.export_timeline_video({ clips: [{ shotId: "x", videoVersionId: null, track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 }] })
    ).rejects.toThrow(/savePath/);
  });

  it("probes the first clip for default settings when omitted", async () => {
    const db = openTestDb();
    const mediaDir = tmpMediaDir();
    const shotId = seedShot(db, "videos/shot.mp4");
    writeMediaFile(mediaDir, "videos/shot.mp4");

    const sink: { cmd?: string; args?: string[] } = {};
    const commands = createExportCommands(
      db,
      mediaDir,
      baseDeps({
        spawn: captureSpawn(sink),
        probeVideo: async () => ({ width: 640, height: 480, fps: 25, hasAudio: false }),
      })
    );

    await commands.export_timeline_video({
      clips: [{ shotId, videoVersionId: null, track: "V1", trimIn: 0, trimOut: 1, startOffset: 0 }],
      settings: {},
      savePath: "/out.mp4",
    });

    const fc = sink.args![sink.args!.indexOf("-filter_complex") + 1];
    expect(fc).toContain("scale=640:480");
    expect(fc).toContain("fps=25");
    // hasAudio=false -> a silent anullsrc input was added.
    expect(sink.args).toContain("anullsrc=r=48000:cl=stereo");
  });
});

describe("show_export_save_dialog", () => {
  it("returns the chosen path", async () => {
    const commands = createExportCommands(
      openTestDb(),
      tmpMediaDir(),
      baseDeps({ showSaveDialog: async () => ({ canceled: false, filePath: "/chosen.mp4" }) })
    );
    expect(await commands.show_export_save_dialog()).toBe("/chosen.mp4");
  });

  it("returns null when cancelled", async () => {
    const commands = createExportCommands(
      openTestDb(),
      tmpMediaDir(),
      baseDeps({ showSaveDialog: async () => ({ canceled: true }) })
    );
    expect(await commands.show_export_save_dialog()).toBeNull();
  });
});
