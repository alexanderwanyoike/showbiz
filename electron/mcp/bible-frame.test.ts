import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createTestDataCommands } from "../test-support/data-commands";
import { createInvokeHandler } from "../ipc";
import { createMcpSession } from "./session";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function bible() {
  const db = openTestDb();
  const commands = createTestDataCommands(db, fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-frame-")));
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const [main] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
  const entry = (asset_type: string, name: string) =>
    commands.create_bible_asset({
      bibleId: main.id,
      input: { asset_type, name, consent_confirmed: false },
    }) as { id: string };
  const sock = entry("character", "Sock detective");
  const office = entry("location", "Office");
  const view = commands.create_bible_asset_variant({
    assetId: office.id,
    input: { name: "night", image_base64: PNG, source_kind: "generated", status: "approved", is_primary: true },
  }) as { id: string };
  const session = createMcpSession(createInvokeHandler(commands));
  return { commands, bibleId: main.id, sock, office, view, session };
}

it("creates a frame entry with the same recipe the frame composer saves", async () => {
  const { commands, bibleId, sock, office, view, session } = bible();
  const created = await session.call({
    tool: "create_bible_frame",
    args: {
      bible_id: bibleId,
      prompt: "The sock detective slumps at a desk",
      character_ids: [sock.id],
      location_id: office.id,
      location_variant_id: view.id,
      expected_revision: 0,
      request_id: "frame-1",
    },
  });
  expect(created).toMatchObject({ ok: true, value: { data: { asset_type: "reference" } } });
  const frame = (commands.get_bible_assets({ bibleId }) as { asset_type: string; name: string; rules_json: string }[]).find(
    (asset) => asset.asset_type === "reference",
  );
  expect(frame?.name).toBe("The sock detective slumps at a desk");
  expect(JSON.parse(frame?.rules_json ?? "{}")).toEqual({
    characters: [sock.id],
    location: office.id,
    locationVariantId: view.id,
    prompt: "The sock detective slumps at a desk",
  });
});

it("refuses references that are not this Bible's characters and locations", async () => {
  const { bibleId, sock, office, view, session } = bible();
  const attempt = (args: Record<string, unknown>, n: number) =>
    session.call({
      tool: "create_bible_frame",
      args: {
        bible_id: bibleId,
        prompt: "A frame",
        character_ids: [],
        location_id: null,
        location_variant_id: null,
        expected_revision: 0,
        request_id: `bad-${n}`,
        ...args,
      },
    });
  expect(await attempt({ character_ids: [office.id] }, 1)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await attempt({ location_id: sock.id }, 2)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await attempt({ location_id: office.id, location_variant_id: "elsewhere" }, 3)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await attempt({ location_variant_id: view.id }, 4)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
});
