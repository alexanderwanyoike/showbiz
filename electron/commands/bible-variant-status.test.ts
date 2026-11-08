import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createTestDataCommands } from "../test-support/data-commands";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function entryWithTwoTakes() {
  const db = openTestDb();
  const commands = createTestDataCommands(
    db,
    fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-variant-status-")),
  );
  const film = commands.create_project({ name: "Skit" }) as { id: string };
  const [bible] = commands.get_bibles({ projectId: film.id }) as { id: string }[];
  const asset = commands.create_bible_asset({
    bibleId: bible.id,
    input: { asset_type: "character", name: "Sock", consent_confirmed: false },
  }) as { id: string };
  const take = (is_primary: boolean) =>
    commands.create_bible_asset_variant({
      assetId: asset.id,
      input: { name: "take", image_base64: PNG, source_kind: "generated", status: "approved", is_primary },
    }) as { id: string };
  return { commands, primary: take(true), other: take(false) };
}

it("never rejects the entry's current picture or makes a rejected take current", () => {
  const { commands, primary, other } = entryWithTwoTakes();
  expect(() =>
    commands.update_bible_asset_variant_status({ id: primary.id, status: "rejected", isPrimary: false }),
  ).toThrow(/current picture/);
  expect(() =>
    commands.update_bible_asset_variant_status({ id: other.id, status: "rejected", isPrimary: true }),
  ).toThrow(/rejected/);
  expect(() =>
    commands.update_bible_asset_variant_status({ id: other.id, status: "shiny", isPrimary: false }),
  ).toThrow(/status/);
  expect(
    commands.update_bible_asset_variant_status({ id: other.id, status: "rejected", isPrimary: false }),
  ).toMatchObject({ status: "rejected", is_primary: false });
});
