import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createTestDataCommands } from "../test-support/data-commands";

it("finds a video take's media URL by its ID, as the version list reports it", () => {
  const commands = createTestDataCommands(openTestDb(), fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-video-url-")));
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const board = commands.create_storyboard({ projectId: film.id, name: "Opening" }) as { id: string };
  const shot = commands.create_shot({ storyboardId: board.id }) as { id: string };
  const take = commands.create_video_generation_version({
    shotId: shot.id,
    videoData: [0, 0, 0, 24, 102, 116, 121, 112],
    mimeType: "video/mp4",
    prompt: "Door",
    settingsJson: null,
    modelId: "local-video",
    parentVersionId: null,
  }) as { id: string; video_url: string };
  expect(commands.get_video_version_url({ versionId: take.id })).toBe(take.video_url);
  expect(commands.get_video_version_url({ versionId: "nope" })).toBeNull();
});
