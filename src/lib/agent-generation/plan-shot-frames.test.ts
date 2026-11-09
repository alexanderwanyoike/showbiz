import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createTestDataCommands } from "../../../electron/test-support/data-commands";
import { imageCostRequest } from "../../../shared/generation-cost";
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
    fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-shot-frames-")),
  );
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const board = commands.create_storyboard({ projectId: film.id, name: "Opening" }) as { id: string };
  const shot = commands.create_shot({ storyboardId: board.id }) as { id: string };
  const other = commands.create_shot({ storyboardId: board.id }) as { id: string };
  const take = commands.create_generation_version({ shotId: shot.id, prompt: "First", imageBase64: PNG, parentVersionId: null }) as { id: string };
  const otherTake = commands.create_generation_version({ shotId: other.id, prompt: "Other", imageBase64: PNG, parentVersionId: null }) as { id: string };
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_project_document_state"
      ? { ok: true, value: { current: { project_id: film.id }, recent: [] } }
      : commands[command]?.(args),
  );
  return { commands, film, shot, other, take, otherTake };
}

it("generates a start frame with the storyboard's image model", async () => {
  const { film, shot } = storyboard();
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "generate", shot_id: shot.id, prompt: "Sock enters the office" }),
  ).toEqual({
    ok: true,
    value: {
      model_id: "nano-banana-2",
      provider: "gemini",
      cost_request: imageCostRequest("image"),
      subject: { project_id: film.id, subject_id: shot.id },
      inputs: { prompt: "Sock enters the office", reference_variant_ids: [], aspect_ratio: "16:9" },
    },
  });
});

it("refuses a shot image model that cannot make 16:9 frames", async () => {
  const { commands, shot } = storyboard();
  commands.set_shot_models({ shot_id: shot.id, image_model: "local-image" });
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "generate", shot_id: shot.id, prompt: "x" }),
  ).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", message: expect.stringContaining("16:9") },
  });
});

it("uses the shot's own image model when it overrides the storyboard", async () => {
  const { commands, shot } = storyboard();
  commands.set_shot_models({ shot_id: shot.id, image_model: "seedream-4.5-openrouter" });
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "generate", shot_id: shot.id, prompt: "x" }),
  ).toMatchObject({ ok: true, value: { model_id: "seedream-4.5-openrouter", provider: "openrouter" } });
});

it("edits one of the shot's own takes", async () => {
  const { shot, take, otherTake } = storyboard();
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "edit", shot_id: shot.id, source_take_id: take.id, prompt: "Darker" }),
  ).toMatchObject({
    ok: true,
    value: {
      cost_request: imageCostRequest("image_edit"),
      inputs: { prompt: "Darker", reference_variant_ids: [], source_take_id: take.id, aspect_ratio: "16:9" },
    },
  });
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "edit", shot_id: shot.id, source_take_id: otherTake.id, prompt: "Darker" }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
});

it("refuses shots outside the open project and models that cannot edit", async () => {
  const { commands, shot, take } = storyboard();
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "generate", shot_id: "elsewhere", prompt: "x" }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  commands.set_shot_models({ shot_id: shot.id, image_model: "local-image" });
  expect(
    await resolveAgentTarget({ target: "shot_start_frame", operation: "edit", shot_id: shot.id, source_take_id: take.id, prompt: "x" }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
});
