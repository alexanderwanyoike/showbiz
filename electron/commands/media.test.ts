import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMediaCommands } from "./media";

describe("createMediaCommands", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-media-cmd-"));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe("get_media_path", () => {
    it("returns the media base directory", () => {
      const commands = createMediaCommands(base);
      expect(commands.get_media_path()).toBe(base);
    });
  });

  describe("save_assembled_video", () => {
    it("writes the video bytes to the requested path", () => {
      const commands = createMediaCommands(base);
      const savePath = path.join(base, "exports", "movie.mp4");
      const videoData = [104, 105]; // "hi"

      const result = commands.save_assembled_video({ videoData, savePath });

      expect(result).toBeUndefined();
      expect(fs.readFileSync(savePath).toString()).toBe("hi");
    });

    it("creates parent directories as needed", () => {
      const commands = createMediaCommands(base);
      const savePath = path.join(base, "a", "b", "c", "movie.mp4");

      commands.save_assembled_video({ videoData: [1, 2, 3], savePath });

      expect(fs.existsSync(savePath)).toBe(true);
    });

    it("preserves raw byte values", () => {
      const commands = createMediaCommands(base);
      const savePath = path.join(base, "movie.mp4");
      const videoData = [0, 255, 128, 1];

      commands.save_assembled_video({ videoData, savePath });

      expect([...fs.readFileSync(savePath)]).toEqual(videoData);
    });

    it("throws a clear error when the save path is a directory", () => {
      const commands = createMediaCommands(base);
      expect(() =>
        commands.save_assembled_video({ videoData: [1], savePath: base })
      ).toThrow(/Failed to write assembled video/);
    });
  });
});
