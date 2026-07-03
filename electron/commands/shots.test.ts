import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { initMediaDirs } from "../media-files";
import { createShotCommands, type ShotWithUrls } from "./shots";

/** Seed a project + storyboard so shots satisfy their FK. */
function seed(db: DatabaseSync, storyboardId = "sb1"): void {
  db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run("p1", "P");
  db.prepare("INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)").run(
    storyboardId,
    "p1",
    "SB"
  );
}

/** Insert a shot row directly, returning its id. */
function insertShot(
  db: DatabaseSync,
  id: string,
  order: number,
  storyboardId = "sb1"
): string {
  db.prepare(
    `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, ?, 'pending')`
  ).run(id, storyboardId, order);
  return id;
}

const pngUrl = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;
const png2Url = `data:image/png;base64,${Buffer.from("png2-bytes").toString("base64")}`;
const mp4Url = `data:video/mp4;base64,${Buffer.from("mp4-bytes").toString("base64")}`;

describe("shot commands", () => {
  let db: DatabaseSync;
  let mediaDir: string;
  let commands: ReturnType<typeof createShotCommands>;

  beforeEach(() => {
    db = openTestDb();
    seed(db);
    mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-shots-"));
    initMediaDirs(mediaDir);
    commands = createShotCommands(db, mediaDir);
  });

  afterEach(() => {
    fs.rmSync(mediaDir, { recursive: true, force: true });
  });

  // -- get_shots --

  describe("get_shots", () => {
    it("returns an empty list for a storyboard with no shots", () => {
      expect(commands.get_shots({ storyboardId: "sb1" })).toEqual([]);
    });

    it("returns shots ordered by order ascending", () => {
      insertShot(db, "sh-b", 2);
      insertShot(db, "sh-a", 1);
      insertShot(db, "sh-c", 3);
      const shots = commands.get_shots({ storyboardId: "sb1" });
      expect(shots.map((s) => s.id)).toEqual(["sh-a", "sh-b", "sh-c"]);
    });

    it("has the full ShotWithUrls shape with null urls when paths are null", () => {
      insertShot(db, "sh1", 1);
      const [shot] = commands.get_shots({ storyboardId: "sb1" });
      expect(Object.keys(shot).sort()).toEqual(
        [
          "created_at",
          "duration",
          "end_frame_path",
          "end_frame_url",
          "id",
          "image_path",
          "image_prompt",
          "image_url",
          "order",
          "status",
          "storyboard_id",
          "updated_at",
          "video_path",
          "video_prompt",
          "video_url",
        ].sort()
      );
      expect(shot.image_path).toBeNull();
      expect(shot.image_url).toBeNull();
      expect(shot.end_frame_url).toBeNull();
      expect(shot.video_url).toBeNull();
      expect(shot.duration).toBe(8);
      expect(shot.status).toBe("pending");
      expect(typeof shot.order).toBe("number");
    });

    it("resolves urls to absolute filesystem paths (mediaDir + relative path)", () => {
      db.prepare(
        `INSERT INTO shots (id, storyboard_id, "order", image_path, end_frame_path, video_path, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      ).run(
        "sh1",
        "sb1",
        1,
        "images/sh1.png",
        "images/sh1_end.png",
        "videos/sh1.mp4"
      );
      const [shot] = commands.get_shots({ storyboardId: "sb1" });
      expect(shot.image_path).toBe("images/sh1.png");
      expect(shot.image_url).toBe(path.join(mediaDir, "images/sh1.png"));
      expect(shot.end_frame_url).toBe(path.join(mediaDir, "images/sh1_end.png"));
      expect(shot.video_url).toBe(path.join(mediaDir, "videos/sh1.mp4"));
    });
  });

  // -- create_shot --

  describe("create_shot", () => {
    it("creates the first shot with order 1", () => {
      const shot = commands.create_shot({ storyboardId: "sb1" });
      expect(shot.order).toBe(1);
      expect(shot.storyboard_id).toBe("sb1");
      expect(shot.duration).toBe(8);
      expect(shot.status).toBe("pending");
      expect(shot.image_url).toBeNull();
    });

    it("computes the next order value from existing shots", () => {
      commands.create_shot({ storyboardId: "sb1" });
      commands.create_shot({ storyboardId: "sb1" });
      const third = commands.create_shot({ storyboardId: "sb1" });
      expect(third.order).toBe(3);
    });

    it("persists the shot so it is returned by get_shots", () => {
      const created = commands.create_shot({ storyboardId: "sb1" });
      const shots = commands.get_shots({ storyboardId: "sb1" });
      expect(shots.map((s) => s.id)).toContain(created.id);
    });
  });

  // -- update_shot --

  describe("update_shot", () => {
    beforeEach(() => insertShot(db, "sh1", 1));

    it("updates whitelisted fields", () => {
      const shot = commands.update_shot({
        id: "sh1",
        updatesJson: JSON.stringify({
          duration: 5,
          image_prompt: "hello",
          video_prompt: "world",
          status: "complete",
        }),
      });
      expect(shot!.duration).toBe(5);
      expect(shot!.image_prompt).toBe("hello");
      expect(shot!.video_prompt).toBe("world");
      expect(shot!.status).toBe("complete");
    });

    it("ignores unknown keys (e.g. image_path)", () => {
      const shot = commands.update_shot({
        id: "sh1",
        updatesJson: JSON.stringify({ image_path: "hacked", duration: 3 }),
      });
      expect(shot!.duration).toBe(3);
      expect(shot!.image_path).toBeNull();
    });

    it("skips fields explicitly set to null", () => {
      commands.update_shot({
        id: "sh1",
        updatesJson: JSON.stringify({ image_prompt: "keep" }),
      });
      const shot = commands.update_shot({
        id: "sh1",
        updatesJson: JSON.stringify({ image_prompt: null, duration: 4 }),
      });
      expect(shot!.image_prompt).toBe("keep");
      expect(shot!.duration).toBe(4);
    });

    it("returns the unchanged shot when there are no whitelisted fields", () => {
      const shot = commands.update_shot({
        id: "sh1",
        updatesJson: JSON.stringify({}),
      });
      expect(shot!.id).toBe("sh1");
      expect(shot!.status).toBe("pending");
    });

    it("throws on invalid updates JSON", () => {
      expect(() =>
        commands.update_shot({ id: "sh1", updatesJson: "not json" })
      ).toThrow(/Invalid updates JSON/);
    });

    it("throws when the shot does not exist", () => {
      expect(() =>
        commands.update_shot({ id: "nope", updatesJson: JSON.stringify({ duration: 2 }) })
      ).toThrow(/not found/i);
    });
  });

  // -- delete_shot --

  describe("delete_shot", () => {
    it("deletes the row and returns true", () => {
      insertShot(db, "sh1", 1);
      expect(commands.delete_shot({ id: "sh1" })).toBe(true);
      expect(commands.get_shots({ storyboardId: "sb1" })).toEqual([]);
    });

    it("returns false when the shot does not exist", () => {
      expect(commands.delete_shot({ id: "nope" })).toBe(false);
    });

    it("removes image, end frame, video, version and mask media", () => {
      insertShot(db, "sh1", 1);
      commands.save_shot_image({ id: "sh1", base64DataUrl: pngUrl, prompt: "p" });
      commands.save_shot_end_frame({ id: "sh1", base64DataUrl: png2Url });
      commands.save_shot_video({ id: "sh1", base64DataUrl: mp4Url });
      // Create version + mask dirs to prove they are swept.
      const versionDir = path.join(mediaDir, "images", "versions", "sh1");
      const maskDir = path.join(mediaDir, "masks", "sh1");
      fs.mkdirSync(versionDir, { recursive: true });
      fs.mkdirSync(maskDir, { recursive: true });
      fs.writeFileSync(path.join(versionDir, "v1.png"), "x");
      fs.writeFileSync(path.join(maskDir, "m.png"), "x");

      expect(commands.delete_shot({ id: "sh1" })).toBe(true);

      expect(fs.existsSync(path.join(mediaDir, "images", "sh1.png"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "images", "sh1_end.png"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "videos", "sh1.mp4"))).toBe(false);
      expect(fs.existsSync(versionDir)).toBe(false);
      expect(fs.existsSync(maskDir)).toBe(false);
    });
  });

  // -- reorder_shots --

  describe("reorder_shots", () => {
    it("renumbers shots from the given id array (1-based)", () => {
      insertShot(db, "sh-a", 1);
      insertShot(db, "sh-b", 2);
      insertShot(db, "sh-c", 3);
      commands.reorder_shots({ storyboardId: "sb1", shotIds: ["sh-c", "sh-a", "sh-b"] });
      const shots = commands.get_shots({ storyboardId: "sb1" });
      expect(shots.map((s) => [s.id, s.order])).toEqual([
        ["sh-c", 1],
        ["sh-a", 2],
        ["sh-b", 3],
      ]);
    });

    it("only updates shots in the matching storyboard", () => {
      db.prepare("INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)").run(
        "sb2",
        "p1",
        "SB2"
      );
      insertShot(db, "sh-a", 1, "sb1");
      insertShot(db, "sh-x", 5, "sb2");
      commands.reorder_shots({ storyboardId: "sb1", shotIds: ["sh-x", "sh-a"] });
      const other = db.prepare(`SELECT "order" AS o FROM shots WHERE id = ?`).get("sh-x") as {
        o: number;
      };
      // sh-x belongs to sb2, so the sb1 reorder must not touch it.
      expect(other.o).toBe(5);
    });

    it("returns undefined (void)", () => {
      insertShot(db, "sh-a", 1);
      expect(commands.reorder_shots({ storyboardId: "sb1", shotIds: ["sh-a"] })).toBeUndefined();
    });
  });

  // -- save_shot_image --

  describe("save_shot_image", () => {
    beforeEach(() => insertShot(db, "sh1", 1));

    it("writes the image, sets prompt, clears video, status pending", () => {
      const shot = commands.save_shot_image({
        id: "sh1",
        base64DataUrl: pngUrl,
        prompt: "a prompt",
      });
      expect(shot!.image_path).toBe("images/sh1.png");
      expect(shot!.image_prompt).toBe("a prompt");
      expect(shot!.video_path).toBeNull();
      expect(shot!.status).toBe("pending");
      expect(shot!.image_url).toBe(path.join(mediaDir, "images/sh1.png"));
      expect(fs.readFileSync(path.join(mediaDir, "images/sh1.png")).toString()).toBe(
        "png-bytes"
      );
    });

    it("deletes the previous image and video files", () => {
      commands.save_shot_image({ id: "sh1", base64DataUrl: pngUrl, prompt: "p" });
      commands.save_shot_video({ id: "sh1", base64DataUrl: mp4Url });
      expect(fs.existsSync(path.join(mediaDir, "videos/sh1.mp4"))).toBe(true);
      // Re-save the image with a jpeg so the old .png is orphaned and removed.
      const jpegUrl = `data:image/jpeg;base64,${Buffer.from("jpg").toString("base64")}`;
      commands.save_shot_image({ id: "sh1", base64DataUrl: jpegUrl, prompt: "p2" });
      expect(fs.existsSync(path.join(mediaDir, "images/sh1.png"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "videos/sh1.mp4"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "images/sh1.jpg"))).toBe(true);
    });
  });

  // -- save_shot_end_frame / clear_shot_end_frame --

  describe("save_shot_end_frame", () => {
    beforeEach(() => insertShot(db, "sh1", 1));

    it("writes the end frame and sets end_frame_path", () => {
      const shot = commands.save_shot_end_frame({ id: "sh1", base64DataUrl: pngUrl });
      expect(shot!.end_frame_path).toBe("images/sh1_end.png");
      expect(shot!.end_frame_url).toBe(path.join(mediaDir, "images/sh1_end.png"));
      expect(fs.existsSync(path.join(mediaDir, "images/sh1_end.png"))).toBe(true);
    });

    it("deletes the previous end frame when the extension changes", () => {
      commands.save_shot_end_frame({ id: "sh1", base64DataUrl: pngUrl });
      const jpegUrl = `data:image/jpeg;base64,${Buffer.from("jpg").toString("base64")}`;
      commands.save_shot_end_frame({ id: "sh1", base64DataUrl: jpegUrl });
      expect(fs.existsSync(path.join(mediaDir, "images/sh1_end.png"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "images/sh1_end.jpg"))).toBe(true);
    });
  });

  describe("clear_shot_end_frame", () => {
    it("clears end_frame_path to null and deletes the file", () => {
      insertShot(db, "sh1", 1);
      commands.save_shot_end_frame({ id: "sh1", base64DataUrl: pngUrl });
      const shot = commands.clear_shot_end_frame({ id: "sh1" });
      expect(shot!.end_frame_path).toBeNull();
      expect(shot!.end_frame_url).toBeNull();
      expect(fs.existsSync(path.join(mediaDir, "images/sh1_end.png"))).toBe(false);
    });
  });

  // -- save_shot_video --

  describe("save_shot_video", () => {
    beforeEach(() => insertShot(db, "sh1", 1));

    it("writes the video and sets status complete", () => {
      const shot = commands.save_shot_video({ id: "sh1", base64DataUrl: mp4Url });
      expect(shot!.video_path).toBe("videos/sh1.mp4");
      expect(shot!.status).toBe("complete");
      expect(shot!.video_url).toBe(path.join(mediaDir, "videos/sh1.mp4"));
      expect(fs.readFileSync(path.join(mediaDir, "videos/sh1.mp4")).toString()).toBe(
        "mp4-bytes"
      );
    });

    it("deletes the previous video when the extension changes", () => {
      commands.save_shot_video({ id: "sh1", base64DataUrl: mp4Url });
      const webmUrl = `data:video/webm;base64,${Buffer.from("webm").toString("base64")}`;
      commands.save_shot_video({ id: "sh1", base64DataUrl: webmUrl });
      expect(fs.existsSync(path.join(mediaDir, "videos/sh1.mp4"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "videos/sh1.webm"))).toBe(true);
    });
  });

  // -- get_shot_image_base64 / get_shot_end_frame_base64 --

  describe("get_shot_image_base64", () => {
    it("returns a data URL when the image exists", () => {
      insertShot(db, "sh1", 1);
      commands.save_shot_image({ id: "sh1", base64DataUrl: pngUrl, prompt: "p" });
      const result = commands.get_shot_image_base64({ shotId: "sh1" });
      expect(result).toBe(pngUrl);
    });

    it("returns null when the shot has no image path", () => {
      insertShot(db, "sh1", 1);
      expect(commands.get_shot_image_base64({ shotId: "sh1" })).toBeNull();
    });

    it("returns null when the shot does not exist", () => {
      expect(commands.get_shot_image_base64({ shotId: "nope" })).toBeNull();
    });

    it("returns null when the file is missing on disk", () => {
      db.prepare(
        `INSERT INTO shots (id, storyboard_id, "order", image_path, status)
         VALUES (?, ?, ?, ?, 'pending')`
      ).run("sh1", "sb1", 1, "images/gone.png");
      expect(commands.get_shot_image_base64({ shotId: "sh1" })).toBeNull();
    });
  });

  describe("get_shot_end_frame_base64", () => {
    it("returns a data URL when the end frame exists", () => {
      insertShot(db, "sh1", 1);
      commands.save_shot_end_frame({ id: "sh1", base64DataUrl: pngUrl });
      expect(commands.get_shot_end_frame_base64({ shotId: "sh1" })).toBe(pngUrl);
    });

    it("returns null when there is no end frame", () => {
      insertShot(db, "sh1", 1);
      expect(commands.get_shot_end_frame_base64({ shotId: "sh1" })).toBeNull();
    });
  });

  // -- copy_image_from_shot --

  describe("copy_image_from_shot", () => {
    it("copies the source image to the target with a generated prompt", () => {
      insertShot(db, "src", 1);
      insertShot(db, "tgt", 2);
      commands.save_shot_image({ id: "src", base64DataUrl: pngUrl, prompt: "orig" });
      const shot = commands.copy_image_from_shot({
        targetShotId: "tgt",
        sourceShotId: "src",
      });
      expect(shot!.image_path).toBe("images/tgt.png");
      expect(shot!.image_prompt).toBe("Copied from Shot #1");
      expect(shot!.video_path).toBeNull();
      expect(shot!.status).toBe("pending");
      expect(fs.readFileSync(path.join(mediaDir, "images/tgt.png")).toString()).toBe(
        "png-bytes"
      );
    });

    it("deletes the target's old media before copying", () => {
      insertShot(db, "src", 1);
      insertShot(db, "tgt", 2);
      commands.save_shot_image({ id: "src", base64DataUrl: pngUrl, prompt: "orig" });
      commands.save_shot_video({ id: "tgt", base64DataUrl: mp4Url });
      commands.copy_image_from_shot({ targetShotId: "tgt", sourceShotId: "src" });
      expect(fs.existsSync(path.join(mediaDir, "videos/tgt.mp4"))).toBe(false);
    });

    it("throws when the source shot does not exist", () => {
      insertShot(db, "tgt", 1);
      expect(() =>
        commands.copy_image_from_shot({ targetShotId: "tgt", sourceShotId: "nope" })
      ).toThrow("Source shot not found");
    });

    it("throws when the source shot has no image", () => {
      insertShot(db, "src", 1);
      insertShot(db, "tgt", 2);
      expect(() =>
        commands.copy_image_from_shot({ targetShotId: "tgt", sourceShotId: "src" })
      ).toThrow("Source shot has no image");
    });
  });

  // -- save_and_complete_video --

  describe("save_and_complete_video", () => {
    beforeEach(() => insertShot(db, "sh1", 1));

    it("writes raw video bytes with the mime-derived extension and completes the shot", () => {
      const bytes = Array.from(Buffer.from("raw-video"));
      const shot = commands.save_and_complete_video({
        shotId: "sh1",
        videoData: bytes,
        mimeType: "video/webm",
      });
      expect(shot.video_path).toBe("videos/sh1.webm");
      expect(shot.status).toBe("complete");
      expect(shot.video_url).toBe(path.join(mediaDir, "videos/sh1.webm"));
      expect(fs.readFileSync(path.join(mediaDir, "videos/sh1.webm")).toString()).toBe(
        "raw-video"
      );
    });

    it("deletes the previous video when the extension changes", () => {
      commands.save_shot_video({ id: "sh1", base64DataUrl: mp4Url });
      commands.save_and_complete_video({
        shotId: "sh1",
        videoData: Array.from(Buffer.from("x")),
        mimeType: "video/webm",
      });
      expect(fs.existsSync(path.join(mediaDir, "videos/sh1.mp4"))).toBe(false);
      expect(fs.existsSync(path.join(mediaDir, "videos/sh1.webm"))).toBe(true);
    });
  });
});

// Type-only assertion the exported interface stays in sync.
export type _ShotWithUrls = ShotWithUrls;
