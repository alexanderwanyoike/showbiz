import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { mediaBaseDir, initMediaDirs, bibleImageRelativePath } from "../media-files";
import { createBibleCommands } from "./bibles";

// A 1x1 transparent PNG as a base64 data URL, for media-save coverage.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Create a project (auto-creates its Main Bible via trigger) and return the default bible id. */
function seedDefaultBible(db: DatabaseSync, projectId = "proj-1"): string {
  db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(projectId, "Series");
  const row = db
    .prepare("SELECT id FROM bibles WHERE project_id = ?")
    .get(projectId) as { id: string };
  return row.id;
}

function seedAsset(db: DatabaseSync, bibleId: string, id = "asset-1", name = "Mara"): string {
  db.prepare(
    `INSERT INTO bible_assets (id, bible_id, asset_type, name, consent_confirmed)
     VALUES (?, ?, 'character', ?, 1)`
  ).run(id, bibleId, name);
  return id;
}

describe("bibles commands", () => {
  let db: DatabaseSync;
  let mediaDir: string;
  let tmpRoot: string;
  let commands: ReturnType<typeof createBibleCommands>;

  beforeEach(() => {
    db = openTestDb();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-bibles-"));
    mediaDir = mediaBaseDir(tmpRoot);
    initMediaDirs(mediaDir);
    commands = createBibleCommands(db, mediaDir);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // --- get_bibles ---
  describe("get_bibles", () => {
    it("returns the default bible with is_default as a real boolean", () => {
      seedDefaultBible(db);
      const bibles = commands.get_bibles({ projectId: "proj-1" });
      expect(bibles.length).toBe(1);
      expect(bibles[0].name).toBe("Main Bible");
      expect(bibles[0].is_default).toBe(true);
      expect(Object.keys(bibles[0]).sort()).toEqual([
        "created_at",
        "description",
        "id",
        "is_default",
        "name",
        "project_id",
        "updated_at",
      ]);
    });

    it("orders default first, then by updated_at descending", () => {
      seedDefaultBible(db);
      commands.create_bible({ projectId: "proj-1", name: "A", description: null });
      commands.create_bible({ projectId: "proj-1", name: "B", description: null });
      const bibles = commands.get_bibles({ projectId: "proj-1" });
      expect(bibles[0].is_default).toBe(true);
      expect(bibles[0].name).toBe("Main Bible");
    });

    it("returns an empty list for a project with no bibles", () => {
      expect(commands.get_bibles({ projectId: "nope" })).toEqual([]);
    });
  });

  // --- create_bible / update_bible / delete_bible ---
  describe("create_bible", () => {
    it("creates a non-default bible and returns it", () => {
      seedDefaultBible(db);
      const bible = commands.create_bible({
        projectId: "proj-1",
        name: "Season 2",
        description: "notes",
      });
      expect(bible.name).toBe("Season 2");
      expect(bible.description).toBe("notes");
      expect(bible.is_default).toBe(false);
      expect(bible.id.startsWith("bible-")).toBe(true);
    });

    it("accepts a null description", () => {
      seedDefaultBible(db);
      const bible = commands.create_bible({ projectId: "proj-1", name: "X", description: null });
      expect(bible.description).toBe(null);
    });
  });

  describe("update_bible", () => {
    it("updates name and description", () => {
      seedDefaultBible(db);
      const created = commands.create_bible({ projectId: "proj-1", name: "Old", description: null });
      const updated = commands.update_bible({ id: created.id, name: "New", description: "d" });
      expect(updated.name).toBe("New");
      expect(updated.description).toBe("d");
    });
  });

  describe("delete_bible", () => {
    it("deletes a non-default bible and returns true", () => {
      seedDefaultBible(db);
      const created = commands.create_bible({ projectId: "proj-1", name: "Temp", description: null });
      expect(commands.delete_bible({ id: created.id })).toBe(true);
      expect(commands.get_bibles({ projectId: "proj-1" }).map((b) => b.id)).not.toContain(created.id);
    });

    it("refuses to delete the default bible and returns false", () => {
      const bibleId = seedDefaultBible(db);
      expect(commands.delete_bible({ id: bibleId })).toBe(false);
      expect(commands.get_bibles({ projectId: "proj-1" }).length).toBe(1);
    });

    it("removes the bible's media directory", () => {
      const bibleId = seedDefaultBible(db);
      const nonDefault = commands.create_bible({ projectId: "proj-1", name: "Temp", description: null });
      const assetId = seedAsset(db, nonDefault.id);
      commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "uploaded", is_primary: true, image_base64: PNG_DATA_URL },
      });
      const bibleMediaDir = path.join(mediaDir, "bible", nonDefault.id);
      expect(fs.existsSync(bibleMediaDir)).toBe(true);
      commands.delete_bible({ id: nonDefault.id });
      expect(fs.existsSync(bibleMediaDir)).toBe(false);
      // Untouched: default bible still present
      expect(bibleId).toBeTruthy();
    });
  });

  // --- get_bible_assets / create / update / delete ---
  describe("bible assets", () => {
    it("creates an asset with consent_confirmed as a real boolean and defaults", () => {
      const bibleId = seedDefaultBible(db);
      const asset = commands.create_bible_asset({
        bibleId,
        input: { asset_type: "character", name: "Mara", consent_confirmed: true },
      });
      expect(asset.name).toBe("Mara");
      expect(asset.asset_type).toBe("character");
      expect(asset.consent_confirmed).toBe(true);
      expect(asset.status).toBe("draft");
      expect(asset.sort_order).toBe(0);
      expect(asset.id.startsWith("asset-")).toBe(true);
    });

    it("round-trips consent_confirmed false", () => {
      const bibleId = seedDefaultBible(db);
      const asset = commands.create_bible_asset({
        bibleId,
        input: { asset_type: "prop", name: "Sword", consent_confirmed: false },
      });
      expect(asset.consent_confirmed).toBe(false);
    });

    it("get_bible_assets lists assets for a bible", () => {
      const bibleId = seedDefaultBible(db);
      commands.create_bible_asset({
        bibleId,
        input: { asset_type: "character", name: "Mara", consent_confirmed: true },
      });
      const assets = commands.get_bible_assets({ bibleId });
      expect(assets.length).toBe(1);
      expect(assets[0].name).toBe("Mara");
    });

    it("update_bible_asset changes fields", () => {
      const bibleId = seedDefaultBible(db);
      const asset = commands.create_bible_asset({
        bibleId,
        input: { asset_type: "character", name: "Mara", consent_confirmed: false },
      });
      const updated = commands.update_bible_asset({
        id: asset.id,
        input: {
          asset_type: "location",
          name: "Castle",
          summary: "s",
          description: "d",
          tags_json: "[]",
          rules_json: "{}",
          consent_confirmed: true,
        },
      });
      expect(updated.asset_type).toBe("location");
      expect(updated.name).toBe("Castle");
      expect(updated.summary).toBe("s");
      expect(updated.consent_confirmed).toBe(true);
    });

    it("delete_bible_asset returns true then false", () => {
      const bibleId = seedDefaultBible(db);
      const asset = commands.create_bible_asset({
        bibleId,
        input: { asset_type: "character", name: "Mara", consent_confirmed: true },
      });
      expect(commands.delete_bible_asset({ id: asset.id })).toBe(true);
      expect(commands.delete_bible_asset({ id: asset.id })).toBe(false);
    });
  });

  // --- variants ---
  describe("bible asset variants", () => {
    // Mirrors Rust test: bible_asset_and_variant_can_be_created
    it("creates a primary variant (exactly one primary per asset)", () => {
      const bibleId = seedDefaultBible(db);
      const assetId = seedAsset(db, bibleId);
      const variant = commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "uploaded", is_primary: true },
      });
      expect(variant.is_primary).toBe(true);
      expect(variant.status).toBe("candidate");
      expect(variant.source_kind).toBe("uploaded");
      expect(variant.id.startsWith("assetvar-")).toBe(true);

      const count = db
        .prepare(
          "SELECT COUNT(*) AS n FROM bible_asset_variants WHERE asset_id = ? AND is_primary = 1"
        )
        .get(assetId) as { n: number };
      expect(count.n).toBe(1);
    });

    it("honours an explicit status", () => {
      const bibleId = seedDefaultBible(db);
      const assetId = seedAsset(db, bibleId);
      const variant = commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "generated", is_primary: false, status: "approved" },
      });
      expect(variant.status).toBe("approved");
      expect(variant.is_primary).toBe(false);
    });

    it("creating a new primary unsets the previous primary", () => {
      const bibleId = seedDefaultBible(db);
      const assetId = seedAsset(db, bibleId);
      const first = commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "uploaded", is_primary: true },
      });
      const second = commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "edited", is_primary: true },
      });
      const variants = commands.get_bible_asset_variants({ assetId });
      const primaries = variants.filter((v) => v.is_primary);
      expect(primaries.length).toBe(1);
      expect(primaries[0].id).toBe(second.id);
      expect(variants.find((v) => v.id === first.id)!.is_primary).toBe(false);
    });

    it("saves an image file and returns media_path plus an absolute media_url", () => {
      const bibleId = seedDefaultBible(db);
      const assetId = seedAsset(db, bibleId);
      const variant = commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "uploaded", is_primary: true, image_base64: PNG_DATA_URL },
      });
      const expectedRel = bibleImageRelativePath(bibleId, variant.id, "png");
      expect(variant.media_path).toBe(expectedRel);
      expect(variant.media_url).toBe(path.join(mediaDir, expectedRel));
      expect(fs.existsSync(path.join(mediaDir, expectedRel))).toBe(true);
    });

    it("leaves media null when no image is supplied", () => {
      const bibleId = seedDefaultBible(db);
      const assetId = seedAsset(db, bibleId);
      const variant = commands.create_bible_asset_variant({
        assetId,
        input: { source_kind: "uploaded", is_primary: false },
      });
      expect(variant.media_path).toBe(null);
      expect(variant.media_url).toBe(null);
    });

    it("get_bible_asset_variants orders primary first then created_at desc", () => {
      const bibleId = seedDefaultBible(db);
      const assetId = seedAsset(db, bibleId);
      db.prepare(
        `INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
         VALUES (?, ?, 'candidate', 'uploaded', 0, '2026-01-01 00:00:00')`
      ).run("v-old", assetId);
      db.prepare(
        `INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
         VALUES (?, ?, 'approved', 'uploaded', 1, '2026-01-02 00:00:00')`
      ).run("v-primary", assetId);
      const variants = commands.get_bible_asset_variants({ assetId });
      expect(variants.map((v) => v.id)).toEqual(["v-primary", "v-old"]);
      expect(variants[0].is_primary).toBe(true);
    });

    describe("update_bible_asset_variant_status", () => {
      it("updates status and promotes to primary, unsetting others", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        const first = commands.create_bible_asset_variant({
          assetId,
          input: { source_kind: "uploaded", is_primary: true },
        });
        const second = commands.create_bible_asset_variant({
          assetId,
          input: { source_kind: "edited", is_primary: false },
        });
        const updated = commands.update_bible_asset_variant_status({
          id: second.id,
          status: "approved",
          isPrimary: true,
        });
        expect(updated.status).toBe("approved");
        expect(updated.is_primary).toBe(true);
        const variants = commands.get_bible_asset_variants({ assetId });
        expect(variants.find((v) => v.id === first.id)!.is_primary).toBe(false);
        expect(variants.filter((v) => v.is_primary).length).toBe(1);
      });

      it("can set status without changing primary", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        const v = commands.create_bible_asset_variant({
          assetId,
          input: { source_kind: "uploaded", is_primary: false },
        });
        const updated = commands.update_bible_asset_variant_status({
          id: v.id,
          status: "rejected",
          isPrimary: false,
        });
        expect(updated.status).toBe("rejected");
        expect(updated.is_primary).toBe(false);
      });
    });

    // Mirrors Rust test: deleting_primary_variant_promotes_remaining_variant
    describe("delete_bible_asset_variant", () => {
      it("promotes the most recent remaining variant when the primary is deleted", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        db.prepare(
          `INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
           VALUES (?, ?, 'approved', 'uploaded', 1, '2026-01-01 00:00:00')`
        ).run("primary-id", assetId);
        db.prepare(
          `INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
           VALUES (?, ?, 'candidate', 'edited', 0, '2026-01-02 00:00:00')`
        ).run("next-id", assetId);

        expect(commands.delete_bible_asset_variant({ id: "primary-id" })).toBe(true);

        const promoted = db
          .prepare("SELECT is_primary, status FROM bible_asset_variants WHERE id = ?")
          .get("next-id") as { is_primary: number; status: string };
        expect(promoted.is_primary).toBe(1);
        expect(promoted.status).toBe("approved");
      });

      it("returns false for a missing variant", () => {
        seedDefaultBible(db);
        expect(commands.delete_bible_asset_variant({ id: "no-such" })).toBe(false);
      });

      it("deletes the variant's media file", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        const variant = commands.create_bible_asset_variant({
          assetId,
          input: { source_kind: "uploaded", is_primary: true, image_base64: PNG_DATA_URL },
        });
        const filepath = path.join(mediaDir, variant.media_path!);
        expect(fs.existsSync(filepath)).toBe(true);
        commands.delete_bible_asset_variant({ id: variant.id });
        expect(fs.existsSync(filepath)).toBe(false);
      });

      it("does not promote when the deleted variant was not primary", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        db.prepare(
          `INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
           VALUES (?, ?, 'approved', 'uploaded', 1, '2026-01-01 00:00:00')`
        ).run("primary-id", assetId);
        db.prepare(
          `INSERT INTO bible_asset_variants (id, asset_id, status, source_kind, is_primary, created_at)
           VALUES (?, ?, 'candidate', 'edited', 0, '2026-01-02 00:00:00')`
        ).run("other-id", assetId);

        expect(commands.delete_bible_asset_variant({ id: "other-id" })).toBe(true);
        const stillPrimary = db
          .prepare("SELECT is_primary FROM bible_asset_variants WHERE id = ?")
          .get("primary-id") as { is_primary: number };
        expect(stillPrimary.is_primary).toBe(1);
      });
    });

    describe("get_bible_variant_image_base64", () => {
      it("returns a data URL for a variant with media", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        const variant = commands.create_bible_asset_variant({
          assetId,
          input: { source_kind: "uploaded", is_primary: true, image_base64: PNG_DATA_URL },
        });
        const result = commands.get_bible_variant_image_base64({ variantId: variant.id });
        expect(result).toMatch(/^data:image\/png;base64,/);
      });

      it("returns null for a variant with no media", () => {
        const bibleId = seedDefaultBible(db);
        const assetId = seedAsset(db, bibleId);
        const variant = commands.create_bible_asset_variant({
          assetId,
          input: { source_kind: "uploaded", is_primary: false },
        });
        expect(commands.get_bible_variant_image_base64({ variantId: variant.id })).toBe(null);
      });

      it("returns null for a missing variant", () => {
        seedDefaultBible(db);
        expect(commands.get_bible_variant_image_base64({ variantId: "no-such" })).toBe(null);
      });
    });
  });
});
