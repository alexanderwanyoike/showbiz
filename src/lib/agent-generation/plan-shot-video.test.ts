import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createTestDataCommands } from "../../../electron/test-support/data-commands";
import { videoCostRequest } from "../shot-video";
import { resolveAgentTarget } from "./plan-quote";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => native);
vi.mock("../electron-media-url", () => ({
  electronMediaUrlResolver: { resolve: async (value: string) => `blob:${value}`, invalidate: () => {} },
}));
afterEach(() => native.invoke.mockReset());

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function storyboard() {
  const db = openTestDb();
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createTestDataCommands(
    db,
    fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-shot-video-")),
  );
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const board = commands.create_storyboard({ projectId: film.id, name: "Opening" }) as { id: string };
  const shot = commands.create_shot({ storyboardId: board.id }) as { id: string };
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_project_document_state"
      ? { ok: true, value: { current: { project_id: film.id }, recent: [] } }
      : commands[command]?.(args),
  );
  const withStartFrame = () =>
    commands.create_generation_version({ shotId: shot.id, prompt: "Start", imageBase64: PNG, parentVersionId: null });
  const shotRecord = () =>
    (commands.get_shots({ storyboardId: board.id }) as { id: string; updated_at: string }[])[0];
  return { commands, film, board, shot, withStartFrame, shotRecord };
}

it("prices a video from the start frame with the shot's saved settings, as the storyboard does", async () => {
  const { commands, film, shot, withStartFrame, shotRecord } = storyboard();
  withStartFrame();
  commands.update_shot({ id: shot.id, updatesJson: JSON.stringify({ video_prompt: "He pushes the door open" }) });
  const settings = { duration: "auto", resolution: "720p", aspectRatio: "auto", audio: true };
  expect(await resolveAgentTarget({ target: "shot_video", operation: "generate", shot_id: shot.id })).toEqual({
    ok: true,
    value: {
      model_id: "seedance-2-fal",
      provider: "fal",
      cost_request: videoCostRequest(settings, "image-to-video", false),
      subject: { project_id: film.id, subject_id: shot.id },
      inputs: {
        prompt: "He pushes the door open",
        reference_variant_ids: [],
        video: { mode: "image-to-video", settings, uses_end_frame: false, shot_updated_at: shotRecord().updated_at },
      },
    },
  });
});

it("refuses a shot with neither a start frame nor a video prompt", async () => {
  const { shot } = storyboard();
  expect(await resolveAgentTarget({ target: "shot_video", operation: "generate", shot_id: shot.id })).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
});

it("refuses a model that needs an end frame the shot does not have", async () => {
  const { commands, shot, withStartFrame } = storyboard();
  withStartFrame();
  commands.set_shot_models({ shot_id: shot.id, video_model: "wan-flf2v-fal" });
  expect(await resolveAgentTarget({ target: "shot_video", operation: "generate", shot_id: shot.id })).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", message: expect.stringContaining("end frame") as string },
  });
});
