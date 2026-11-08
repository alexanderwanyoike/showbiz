import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../../electron/db.test";
import { createTestDataCommands } from "../../../electron/test-support/data-commands";
import { setShotFrameFromBible } from "./set-shot-frame";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../bridge", () => native);
vi.mock("../electron-media-url", () => ({
  electronMediaUrlResolver: { resolve: async (value: string) => `blob:${value}`, invalidate: () => {} },
}));
afterEach(() => native.invoke.mockReset());

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function project() {
  const db = openTestDb();
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createTestDataCommands(
    db,
    fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-set-frame-")),
  );
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const [bible] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
  const entry = (asset_type: string) =>
    commands.create_bible_asset({ bibleId: bible.id, input: { asset_type, name: asset_type, consent_confirmed: false } }) as { id: string };
  const picture = (assetId: string) =>
    commands.create_bible_asset_variant({
      assetId,
      input: { name: "take", image_base64: PNG, source_kind: "generated", status: "approved", is_primary: true },
    }) as { id: string };
  const frameTake = picture(entry("reference").id);
  const characterTake = picture(entry("character").id);
  const board = commands.create_storyboard({ projectId: film.id, name: "Opening" }) as { id: string };
  const shot = commands.create_shot({ storyboardId: board.id }) as { id: string };
  const first = commands.create_generation_version({ shotId: shot.id, prompt: "First", imageBase64: PNG, parentVersionId: null }) as { id: string };
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_project_document_state"
      ? { ok: true, value: { current: { project_id: film.id }, recent: [] } }
      : commands[command]?.(args),
  );
  return { commands, board, shot, first, frameTake, characterTake };
}

it("puts a Bible frame into a shot's start frame as a new take, like the frame picker", async () => {
  const { commands, shot, first, frameTake } = project();
  expect(
    await setShotFrameFromBible({ shot_id: shot.id, role: "start", bible_variant_id: frameTake.id }),
  ).toEqual({ ok: true, value: { shot_id: shot.id, role: "start" } });
  const [root] = commands.get_image_versions({ shotId: shot.id }) as {
    version: { id: string };
    children: { version: { prompt: string; is_current: boolean; parent_version_id: string } }[];
  }[];
  expect(root.version.id).toBe(first.id);
  expect(root.children[0].version).toMatchObject({ prompt: "Uploaded frame", is_current: true, parent_version_id: first.id });
});

it("puts a Bible frame into a shot's end frame slot", async () => {
  const { commands, board, shot, frameTake } = project();
  await setShotFrameFromBible({ shot_id: shot.id, role: "end", bible_variant_id: frameTake.id });
  const [withEnd] = commands.get_shots({ storyboardId: board.id }) as { end_frame_path: string | null }[];
  expect(withEnd.end_frame_path).toBeTruthy();
});

it("only accepts frames from the open project's Bible", async () => {
  const { shot, characterTake } = project();
  expect(
    await setShotFrameFromBible({ shot_id: shot.id, role: "start", bible_variant_id: characterTake.id }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(
    await setShotFrameFromBible({ shot_id: shot.id, role: "start", bible_variant_id: "elsewhere" }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(
    await setShotFrameFromBible({ shot_id: "elsewhere", role: "start", bible_variant_id: characterTake.id }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
});

it("refuses a frame take that has no picture", async () => {
  const { commands, shot, frameTake } = project();
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_bible_variant_image_base64"
      ? null
      : command === "get_project_document_state"
        ? { ok: true, value: { current: { project_id: (commands.get_projects() as { id: string }[])[0].id }, recent: [] } }
        : commands[command]?.(args),
  );
  expect(
    await setShotFrameFromBible({ shot_id: shot.id, role: "end", bible_variant_id: frameTake.id }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
});
