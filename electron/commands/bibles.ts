import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { generateId } from "../db";
import {
  saveBibleImage,
  deleteBibleMedia,
  deleteMedia,
  getImageAsBase64,
} from "../media-files";

export interface Bible {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface BibleAsset {
  id: string;
  bible_id: string;
  asset_type: string;
  name: string;
  summary: string | null;
  description: string | null;
  tags_json: string | null;
  rules_json: string | null;
  consent_confirmed: boolean;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BibleAssetVariant {
  id: string;
  asset_id: string;
  parent_variant_id: string | null;
  name: string | null;
  status: string;
  media_path: string | null;
  media_url: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  model_id: string | null;
  source_kind: string;
  is_primary: boolean;
  created_at: string;
}

interface BibleAssetInput {
  asset_type: string;
  name: string;
  summary?: string | null;
  description?: string | null;
  tags_json?: string | null;
  rules_json?: string | null;
  consent_confirmed: boolean;
}

interface BibleAssetVariantInput {
  parent_variant_id?: string | null;
  name?: string | null;
  status?: string | null;
  image_base64?: string | null;
  prompt?: string | null;
  negative_prompt?: string | null;
  model_id?: string | null;
  source_kind: string;
  is_primary: boolean;
}

// Raw rows as node:sqlite returns them: integer columns for the DB booleans.
interface BibleRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface BibleAssetRow {
  id: string;
  bible_id: string;
  asset_type: string;
  name: string;
  summary: string | null;
  description: string | null;
  tags_json: string | null;
  rules_json: string | null;
  consent_confirmed: number;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BibleAssetVariantRow {
  id: string;
  asset_id: string;
  parent_variant_id: string | null;
  name: string | null;
  status: string;
  media_path: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  model_id: string | null;
  source_kind: string;
  is_primary: number;
  created_at: string;
}

const BIBLE_COLUMNS =
  "id, project_id, name, description, is_default, created_at, updated_at";
const ASSET_COLUMNS =
  "id, bible_id, asset_type, name, summary, description, tags_json, rules_json, consent_confirmed, status, sort_order, created_at, updated_at";
const VARIANT_COLUMNS =
  "id, asset_id, parent_variant_id, name, status, media_path, prompt, negative_prompt, model_id, source_kind, is_primary, created_at";

/**
 * Ported bible/asset/variant commands; names and JSON shapes match
 * the retired Rust backend's commands/bibles.rs. `mediaDir` is the appDataDir/media path
 * (the Rust command derives it from the AppHandle); it is used both to save
 * variant images and to build the absolute `media_url`, mirroring Rust's
 * make_media_url which joins the media base dir with the relative media_path.
 */
export function createBibleCommands(db: DatabaseSync, mediaDir: string) {
  function makeMediaUrl(relativePath: string): string {
    return path.join(mediaDir, relativePath);
  }

  function rowToBible(row: BibleRow): Bible {
    return {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      description: row.description,
      is_default: row.is_default !== 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function rowToAsset(row: BibleAssetRow): BibleAsset {
    return {
      id: row.id,
      bible_id: row.bible_id,
      asset_type: row.asset_type,
      name: row.name,
      summary: row.summary,
      description: row.description,
      tags_json: row.tags_json,
      rules_json: row.rules_json,
      consent_confirmed: row.consent_confirmed !== 0,
      status: row.status,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function rowToVariant(row: BibleAssetVariantRow): BibleAssetVariant {
    return {
      id: row.id,
      asset_id: row.asset_id,
      parent_variant_id: row.parent_variant_id,
      name: row.name,
      status: row.status,
      media_path: row.media_path,
      media_url: row.media_path === null ? null : makeMediaUrl(row.media_path),
      prompt: row.prompt,
      negative_prompt: row.negative_prompt,
      model_id: row.model_id,
      source_kind: row.source_kind,
      is_primary: row.is_primary !== 0,
      created_at: row.created_at,
    };
  }

  function getBibleById(id: string): Bible {
    const row = db
      .prepare(`SELECT ${BIBLE_COLUMNS} FROM bibles WHERE id = ?`)
      .get(id) as unknown as BibleRow;
    return rowToBible(row);
  }

  function getAssetById(id: string): BibleAsset {
    const row = db
      .prepare(`SELECT ${ASSET_COLUMNS} FROM bible_assets WHERE id = ?`)
      .get(id) as unknown as BibleAssetRow;
    return rowToAsset(row);
  }

  function getVariantById(id: string): BibleAssetVariant {
    const row = db
      .prepare(`SELECT ${VARIANT_COLUMNS} FROM bible_asset_variants WHERE id = ?`)
      .get(id) as unknown as BibleAssetVariantRow;
    return rowToVariant(row);
  }

  function getBibles(projectId: string): Bible[] {
    const rows = db
      .prepare(
        `SELECT ${BIBLE_COLUMNS} FROM bibles WHERE project_id = ?
         ORDER BY is_default DESC, updated_at DESC`
      )
      .all(projectId) as unknown as BibleRow[];
    return rows.map(rowToBible);
  }

  function createBible(projectId: string, name: string, description: string | null): Bible {
    const id = generateId("bible");
    db.prepare(
      "INSERT INTO bibles (id, project_id, name, description) VALUES (?, ?, ?, ?)"
    ).run(id, projectId, name, description ?? null);
    return getBibleById(id);
  }

  function updateBible(id: string, name: string, description: string | null): Bible {
    db.prepare(
      "UPDATE bibles SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(name, description ?? null, id);
    return getBibleById(id);
  }

  function deleteBible(id: string): boolean {
    // Rust removes the media dir unconditionally before the DB delete, so a
    // default bible (which is not deleted) still has its media cleared here.
    deleteBibleMedia(mediaDir, id);
    const { changes } = db
      .prepare("DELETE FROM bibles WHERE id = ? AND is_default = 0")
      .run(id);
    return Number(changes) > 0;
  }

  function getBibleAssets(bibleId: string): BibleAsset[] {
    const rows = db
      .prepare(
        `SELECT ${ASSET_COLUMNS} FROM bible_assets WHERE bible_id = ?
         ORDER BY sort_order ASC, updated_at DESC`
      )
      .all(bibleId) as unknown as BibleAssetRow[];
    return rows.map(rowToAsset);
  }

  function createBibleAsset(bibleId: string, input: BibleAssetInput): BibleAsset {
    const id = generateId("asset");
    db.prepare(
      `INSERT INTO bible_assets
       (id, bible_id, asset_type, name, summary, description, tags_json, rules_json, consent_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      bibleId,
      input.asset_type,
      input.name,
      input.summary ?? null,
      input.description ?? null,
      input.tags_json ?? null,
      input.rules_json ?? null,
      input.consent_confirmed ? 1 : 0
    );
    return getAssetById(id);
  }

  function updateBibleAsset(id: string, input: BibleAssetInput): BibleAsset {
    db.prepare(
      `UPDATE bible_assets
       SET asset_type = ?, name = ?, summary = ?, description = ?, tags_json = ?,
           rules_json = ?, consent_confirmed = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      input.asset_type,
      input.name,
      input.summary ?? null,
      input.description ?? null,
      input.tags_json ?? null,
      input.rules_json ?? null,
      input.consent_confirmed ? 1 : 0,
      id
    );
    return getAssetById(id);
  }

  function deleteBibleAsset(id: string): boolean {
    const { changes } = db
      .prepare("DELETE FROM bible_assets WHERE id = ?")
      .run(id);
    return Number(changes) > 0;
  }

  function getBibleAssetVariants(assetId: string): BibleAssetVariant[] {
    const rows = db
      .prepare(
        `SELECT ${VARIANT_COLUMNS} FROM bible_asset_variants WHERE asset_id = ?
         ORDER BY is_primary DESC, created_at DESC`
      )
      .all(assetId) as unknown as BibleAssetVariantRow[];
    return rows.map(rowToVariant);
  }

  function createBibleAssetVariant(
    assetId: string,
    input: BibleAssetVariantInput
  ): BibleAssetVariant {
    const bibleRow = db
      .prepare("SELECT bible_id FROM bible_assets WHERE id = ?")
      .get(assetId) as { bible_id: string } | undefined;
    if (!bibleRow) {
      // Deliberate deviation: Rust surfaces rusqlite's incidental
      // "Query returned no rows" here; no caller matches on the text.
      throw new Error("Bible asset not found");
    }
    const bibleId = bibleRow.bible_id;
    const id = generateId("assetvar");

    // Save the image before the primary-flag update and insert, matching Rust.
    const mediaPath = input.image_base64
      ? saveBibleImage(mediaDir, bibleId, id, input.image_base64)
      : null;

    if (input.is_primary) {
      db.prepare(
        "UPDATE bible_asset_variants SET is_primary = 0 WHERE asset_id = ?"
      ).run(assetId);
    }

    db.prepare(
      `INSERT INTO bible_asset_variants
       (id, asset_id, parent_variant_id, name, status, media_path, prompt, negative_prompt, model_id, source_kind, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      assetId,
      input.parent_variant_id ?? null,
      input.name ?? null,
      input.status ?? "candidate",
      mediaPath,
      input.prompt ?? null,
      input.negative_prompt ?? null,
      input.model_id ?? null,
      input.source_kind,
      input.is_primary ? 1 : 0
    );

    return getVariantById(id);
  }

  function updateBibleAssetVariantStatus(
    id: string,
    status: string,
    isPrimary: boolean
  ): BibleAssetVariant {
    const assetRow = db
      .prepare("SELECT asset_id FROM bible_asset_variants WHERE id = ?")
      .get(id) as { asset_id: string } | undefined;
    if (!assetRow) {
      // Deliberate deviation: Rust surfaces rusqlite's incidental
      // "Query returned no rows" here; no caller matches on the text.
      throw new Error("Bible asset variant not found");
    }

    if (isPrimary) {
      db.prepare(
        "UPDATE bible_asset_variants SET is_primary = 0 WHERE asset_id = ?"
      ).run(assetRow.asset_id);
    }

    db.prepare(
      "UPDATE bible_asset_variants SET status = ?, is_primary = ? WHERE id = ?"
    ).run(status, isPrimary ? 1 : 0, id);

    return getVariantById(id);
  }

  function deleteBibleAssetVariant(id: string): boolean {
    const variant = db
      .prepare(
        "SELECT asset_id, media_path, is_primary FROM bible_asset_variants WHERE id = ?"
      )
      .get(id) as
      | { asset_id: string; media_path: string | null; is_primary: number }
      | undefined;

    if (!variant) {
      return false;
    }

    const wasPrimary = variant.is_primary !== 0;
    const { changes } = db
      .prepare("DELETE FROM bible_asset_variants WHERE id = ?")
      .run(id);

    if (Number(changes) > 0) {
      if (variant.media_path) {
        deleteMedia(mediaDir, variant.media_path);
      }
      if (wasPrimary) {
        const next = db
          .prepare(
            "SELECT id FROM bible_asset_variants WHERE asset_id = ? ORDER BY created_at DESC LIMIT 1"
          )
          .get(variant.asset_id) as { id: string } | undefined;
        if (next) {
          db.prepare(
            "UPDATE bible_asset_variants SET is_primary = 1, status = 'approved' WHERE id = ?"
          ).run(next.id);
        }
      }
    }

    return Number(changes) > 0;
  }

  function getBibleVariantImageBase64(variantId: string): string | null {
    const row = db
      .prepare("SELECT media_path FROM bible_asset_variants WHERE id = ?")
      .get(variantId) as { media_path: string | null } | undefined;
    const mediaPath = row?.media_path ?? null;
    if (mediaPath === null) {
      return null;
    }
    return getImageAsBase64(mediaDir, mediaPath);
  }

  return {
    get_bibles(args?: Record<string, unknown>): Bible[] {
      return getBibles(args!.projectId as string);
    },
    create_bible(args?: Record<string, unknown>): Bible {
      return createBible(
        args!.projectId as string,
        args!.name as string,
        (args!.description as string | null | undefined) ?? null
      );
    },
    update_bible(args?: Record<string, unknown>): Bible {
      return updateBible(
        args!.id as string,
        args!.name as string,
        (args!.description as string | null | undefined) ?? null
      );
    },
    delete_bible(args?: Record<string, unknown>): boolean {
      return deleteBible(args!.id as string);
    },
    get_bible_assets(args?: Record<string, unknown>): BibleAsset[] {
      return getBibleAssets(args!.bibleId as string);
    },
    create_bible_asset(args?: Record<string, unknown>): BibleAsset {
      return createBibleAsset(args!.bibleId as string, args!.input as BibleAssetInput);
    },
    update_bible_asset(args?: Record<string, unknown>): BibleAsset {
      return updateBibleAsset(args!.id as string, args!.input as BibleAssetInput);
    },
    delete_bible_asset(args?: Record<string, unknown>): boolean {
      return deleteBibleAsset(args!.id as string);
    },
    get_bible_asset_variants(args?: Record<string, unknown>): BibleAssetVariant[] {
      return getBibleAssetVariants(args!.assetId as string);
    },
    create_bible_asset_variant(args?: Record<string, unknown>): BibleAssetVariant {
      return createBibleAssetVariant(
        args!.assetId as string,
        args!.input as BibleAssetVariantInput
      );
    },
    update_bible_asset_variant_status(args?: Record<string, unknown>): BibleAssetVariant {
      return updateBibleAssetVariantStatus(
        args!.id as string,
        args!.status as string,
        args!.isPrimary as boolean
      );
    },
    delete_bible_asset_variant(args?: Record<string, unknown>): boolean {
      return deleteBibleAssetVariant(args!.id as string);
    },
    get_bible_variant_image_base64(args?: Record<string, unknown>): string | null {
      return getBibleVariantImageBase64(args!.variantId as string);
    },
  };
}
