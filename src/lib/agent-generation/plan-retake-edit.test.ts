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

function bible() {
  const db = openTestDb();
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> = createTestDataCommands(
    db,
    fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-retake-")),
  );
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const [main] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
  const entry = (asset_type: string, name: string, rules_json: string | null = null) =>
    commands.create_bible_asset({
      bibleId: main.id,
      input: { asset_type, name, rules_json, consent_confirmed: false },
    }) as { id: string };
  const picture = (assetId: string, prompt: string) =>
    commands.create_bible_asset_variant({
      assetId,
      input: { name: "take", image_base64: PNG, source_kind: "generated", status: "approved", prompt, is_primary: true },
    }) as { id: string };
  const sock = entry("character", "Sock detective");
  const sockPicture = picture(sock.id, "A sock puppet detective");
  const office = entry("location", "Office");
  const officePicture = picture(office.id, "A tiny office");
  const frame = entry(
    "reference",
    "Desk",
    JSON.stringify({ characters: [sock.id], location: office.id, locationVariantId: officePicture.id, prompt: "Sock at the desk" }),
  );
  const bare = entry("character", "Hat");
  native.invoke.mockImplementation(async (command: string, args) =>
    command === "get_project_document_state"
      ? { ok: true, value: { current: { project_id: film.id }, recent: [] } }
      : commands[command]?.(args),
  );
  const makeFrame = (characters: string[]) =>
    entry(
      "reference",
      "Crowd",
      JSON.stringify({ characters, location: null, locationVariantId: null, prompt: "A crowd" }),
    );
  const pictured = (name: string) => {
    const character = entry("character", name);
    picture(character.id, name);
    return character.id;
  };
  return { film, sock, sockPicture, office, officePicture, frame, bare, makeFrame, pictured };
}
const ask = (overrides: Record<string, unknown>) => ({
  target: "bible_asset" as const,
  model_id: "seedream-4.5-openrouter",
  ...overrides,
}) as Parameters<typeof resolveAgentTarget>[0];

it("retakes an entry on-model from its own picture, with the prompt that made it", async () => {
  const { film, sock, sockPicture } = bible();
  expect(await resolveAgentTarget(ask({ operation: "retake", asset_id: sock.id }))).toEqual({
    ok: true,
    value: {
      model_id: "seedream-4.5-openrouter",
      provider: "openrouter",
      cost_request: imageCostRequest("image_compose"),
      subject: { project_id: film.id, subject_id: sock.id },
      inputs: { prompt: "A sock puppet detective", reference_variant_ids: [sockPicture.id] },
    },
  });
});

it("composes a frame from its recipe's characters and location view", async () => {
  const { frame, sockPicture, officePicture } = bible();
  expect(
    await resolveAgentTarget(ask({ operation: "retake", asset_id: frame.id, prompt: "Sock asleep at the desk" })),
  ).toMatchObject({
    ok: true,
    value: {
      cost_request: imageCostRequest("image_compose"),
      inputs: { prompt: "Sock asleep at the desk", reference_variant_ids: [sockPicture.id, officePicture.id], aspect_ratio: "16:9" },
    },
  });
});

it("retakes an entry without pictures from its prompt alone, and needs a prompt", async () => {
  const { bare } = bible();
  expect(
    await resolveAgentTarget(ask({ operation: "retake", asset_id: bare.id, prompt: "A bowler hat" })),
  ).toMatchObject({
    ok: true,
    value: { cost_request: imageCostRequest("image"), inputs: { reference_variant_ids: [] } },
  });
  expect(await resolveAgentTarget(ask({ operation: "retake", asset_id: bare.id }))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
});

it("refuses composition with a model that cannot compose", async () => {
  const { sock } = bible();
  expect(
    await resolveAgentTarget(ask({ operation: "retake", asset_id: sock.id, model_id: "local-image" })),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
});

it("edits one of the entry's own pictures with a model that can edit", async () => {
  const { film, sock, sockPicture, officePicture } = bible();
  expect(
    await resolveAgentTarget(ask({ operation: "edit", asset_id: sock.id, source_variant_id: sockPicture.id, prompt: "Add a magnifying glass" })),
  ).toEqual({
    ok: true,
    value: {
      model_id: "seedream-4.5-openrouter",
      provider: "openrouter",
      cost_request: imageCostRequest("image_edit"),
      subject: { project_id: film.id, subject_id: sock.id },
      inputs: { prompt: "Add a magnifying glass", reference_variant_ids: [], source_variant_id: sockPicture.id },
    },
  });
  expect(
    await resolveAgentTarget(ask({ operation: "edit", asset_id: sock.id, source_variant_id: officePicture.id, prompt: "x" })),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(
    await resolveAgentTarget(ask({ operation: "edit", asset_id: sock.id, source_variant_id: sockPicture.id, prompt: "x", model_id: "local-image" })),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
});

it("refuses a frame whose characters have no picture yet instead of dropping them", async () => {
  const { bare, office, officePicture } = bible();
  const frame = await (async () => {
    const commands = native.invoke;
    return commands("create_bible_asset", {
      bibleId: ((await commands("get_bibles", { projectId: (await commands("get_project_document_state")).value.current.project_id })) as { id: string }[])[0].id,
      input: {
        asset_type: "reference",
        name: "Hat on desk",
        rules_json: JSON.stringify({ characters: [bare.id], location: office.id, locationVariantId: officePicture.id, prompt: "Hat on the desk" }),
        consent_confirmed: false,
      },
    }) as Promise<{ id: string }>;
  })();
  expect(await resolveAgentTarget(ask({ operation: "retake", asset_id: frame.id }))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", message: expect.stringContaining("Hat") as string },
  });
});

it("composes a frame without entries that were deleted, as the app does", async () => {
  const { makeFrame, sockPicture, sock } = bible();
  const frame = makeFrame([sock.id, "deleted-character"]);
  expect(await resolveAgentTarget(ask({ operation: "retake", asset_id: frame.id }))).toMatchObject({
    ok: true,
    value: { inputs: { reference_variant_ids: [sockPicture.id] } },
  });
});

it("refuses a frame with more pictures than one composition can use", async () => {
  const { makeFrame, pictured } = bible();
  const frame = makeFrame(Array.from({ length: 11 }, (_, n) => pictured(`Extra ${n}`)));
  expect(await resolveAgentTarget(ask({ operation: "retake", asset_id: frame.id }))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", message: expect.stringContaining("at most 10") as string },
  });
});
