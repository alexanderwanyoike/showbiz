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
});
