import type { BibleAsset, BibleAssetVariant } from "./tauri-api";

// A frame's compose recipe, stored as JSON on the frame asset so the frame can
// be reproduced (retaken) or varied while keeping its characters and location.
export interface FrameRecipe {
  characters: string[]; // character asset ids (compose uses each one's primary picture)
  location: string | null; // location asset id (for display)
  locationVariantId: string | null; // the chosen location view (compose uses this picture)
  prompt: string;
}

type VariantMap = Record<string, BibleAssetVariant[]>;

export function parseRecipe(rulesJson: string | null): FrameRecipe {
  try {
    const r = JSON.parse(rulesJson || "{}");
    return {
      characters: Array.isArray(r.characters) ? r.characters : [],
      location: r.location ?? null,
      locationVariantId: r.locationVariantId ?? null,
      prompt: typeof r.prompt === "string" ? r.prompt : "",
    };
  } catch {
    return { characters: [], location: null, locationVariantId: null, prompt: "" };
  }
}

export function primaryPicture(variants: BibleAssetVariant[]): BibleAssetVariant | null {
  return variants.find((v) => v.is_primary && v.media_url) ?? variants.find((v) => v.media_url) ?? null;
}

// Reference picture ids that keep a composed frame on-model: each character's
// primary picture plus the chosen location view.
export function recipeVariantIds(recipe: FrameRecipe, variants: VariantMap): string[] {
  const ids: string[] = [];
  for (const cid of recipe.characters) {
    const pic = primaryPicture(variants[cid] ?? []);
    if (pic) ids.push(pic.id);
  }
  if (recipe.locationVariantId) ids.push(recipe.locationVariantId);
  return ids;
}

// References (variant ids) used to keep an asset on-model when retaking/varying:
// a frame uses its recipe; a character or location feeds its own primary back in.
export function assetReferences(asset: BibleAsset, variants: VariantMap): string[] {
  if (asset.asset_type === "reference") return recipeVariantIds(parseRecipe(asset.rules_json), variants);
  const pic = primaryPicture(variants[asset.id] ?? []);
  return pic ? [pic.id] : [];
}

// The default prompt for a retake/variation: a frame uses its recipe prompt; a
// character or location uses the prompt that made its primary picture.
export function assetBasePrompt(asset: BibleAsset, variants: VariantMap): string {
  if (asset.asset_type === "reference") return parseRecipe(asset.rules_json).prompt;
  return primaryPicture(variants[asset.id] ?? [])?.prompt ?? "";
}

// Every usable take of every frame, as options for a shot's start/end frame.
// A frame with multiple takes lists each ("Name · take N", primary marked) so
// you can pick a specific variation, not just the primary.
export function buildFrameOptions(
  frames: BibleAsset[],
  variants: VariantMap
): Array<{ variantId: string; label: string; url: string | null }> {
  const options: Array<{ variantId: string; label: string; url: string | null }> = [];
  for (const frame of frames) {
    if (frame.asset_type !== "reference") continue;
    const pics = (variants[frame.id] ?? []).filter((v) => v.media_url);
    pics.forEach((pic, i) => {
      const label =
        pics.length > 1
          ? `${frame.name} · take ${i + 1}${pic.is_primary ? " (current)" : ""}`
          : frame.name;
      options.push({ variantId: pic.id, label, url: pic.media_url });
    });
  }
  return options;
}

// "Built from: <characters> · <location>" for a composed frame, or null.
export function builtFromLabel(
  frame: BibleAsset,
  characters: BibleAsset[],
  locations: BibleAsset[]
): string | null {
  const recipe = parseRecipe(frame.rules_json);
  const names = [
    ...recipe.characters.map((id) => characters.find((c) => c.id === id)?.name),
    recipe.location ? locations.find((l) => l.id === recipe.location)?.name : null,
  ].filter((n): n is string => !!n);
  return names.length ? names.join(" · ") : null;
}
