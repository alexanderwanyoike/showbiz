import { describe, it, expect } from "vitest";
import type { BibleAsset, BibleAssetVariant } from "./tauri-api";
import {
  parseRecipe,
  primaryPicture,
  recipeVariantIds,
  assetReferences,
  assetBasePrompt,
  buildFrameOptions,
  filterFrameOptions,
  builtFromLabel,
  type FrameRecipe,
} from "./bible-compose";

function variant(over: Partial<BibleAssetVariant>): BibleAssetVariant {
  return {
    id: "v1",
    asset_id: "a1",
    media_path: "p.png",
    media_url: "asset://p.png",
    prompt: null,
    source_kind: "generated",
    status: "approved",
    model_id: null,
    is_primary: false,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...over,
  } as BibleAssetVariant;
}

function asset(over: Partial<BibleAsset>): BibleAsset {
  return {
    id: "a1",
    bible_id: "b1",
    asset_type: "character",
    name: "Asset",
    summary: null,
    description: null,
    tags_json: null,
    rules_json: null,
    consent_confirmed: false,
    status: "approved",
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...over,
  } as BibleAsset;
}

describe("parseRecipe", () => {
  it("parses a stored recipe", () => {
    const json = JSON.stringify({ characters: ["c1"], location: "l1", locationVariantId: "lv1", prompt: "hi" });
    expect(parseRecipe(json)).toEqual({ characters: ["c1"], location: "l1", locationVariantId: "lv1", prompt: "hi" });
  });

  it("falls back to an empty recipe for null or malformed JSON", () => {
    const empty: FrameRecipe = { characters: [], location: null, locationVariantId: null, prompt: "" };
    expect(parseRecipe(null)).toEqual(empty);
    expect(parseRecipe("not json")).toEqual(empty);
    expect(parseRecipe("{}")).toEqual(empty);
  });

  it("ignores a non-array characters field", () => {
    expect(parseRecipe(JSON.stringify({ characters: "c1" })).characters).toEqual([]);
  });
});

describe("primaryPicture", () => {
  it("prefers the primary with an image, else the first with an image", () => {
    const a = variant({ id: "a", is_primary: false });
    const b = variant({ id: "b", is_primary: true });
    expect(primaryPicture([a, b])?.id).toBe("b");
    expect(primaryPicture([a])?.id).toBe("a");
  });

  it("skips entries without a media_url", () => {
    const noImg = variant({ id: "x", is_primary: true, media_url: null });
    const img = variant({ id: "y", media_url: "asset://y.png" });
    expect(primaryPicture([noImg, img])?.id).toBe("y");
    expect(primaryPicture([noImg])).toBeNull();
  });
});

describe("recipeVariantIds", () => {
  const variants: Record<string, BibleAssetVariant[]> = {
    c1: [variant({ id: "c1-primary", asset_id: "c1", is_primary: true })],
    l1: [variant({ id: "l1-primary", asset_id: "l1", is_primary: true })],
  };

  it("resolves each character's primary picture plus the chosen location view", () => {
    const recipe: FrameRecipe = { characters: ["c1"], location: "l1", locationVariantId: "l1-view", prompt: "x" };
    expect(recipeVariantIds(recipe, variants)).toEqual(["c1-primary", "l1-view"]);
  });

  it("skips characters that have no picture yet", () => {
    const recipe: FrameRecipe = { characters: ["c1", "missing"], location: null, locationVariantId: null, prompt: "x" };
    expect(recipeVariantIds(recipe, variants)).toEqual(["c1-primary"]);
  });
});

describe("assetReferences", () => {
  const variants: Record<string, BibleAssetVariant[]> = {
    char1: [variant({ id: "char1-pic", asset_id: "char1", is_primary: true })],
    loc1: [variant({ id: "loc1-pic", asset_id: "loc1", is_primary: true })],
    frame1: [variant({ id: "frame1-take", asset_id: "frame1", is_primary: true })],
  };

  // Regression: a frame variation/retake must keep its character + location
  // references, not fall back to a reference-less text-to-image generation.
  it("keeps a frame's character and location references", () => {
    const frame = asset({
      id: "frame1",
      asset_type: "reference",
      rules_json: JSON.stringify({ characters: ["char1"], location: "loc1", locationVariantId: "loc1-view", prompt: "p" }),
    });
    expect(assetReferences(frame, variants)).toEqual(["char1-pic", "loc1-view"]);
  });

  it("uses a character's own primary picture as its reference", () => {
    const character = asset({ id: "char1", asset_type: "character" });
    expect(assetReferences(character, variants)).toEqual(["char1-pic"]);
  });

  it("returns no references when an asset has no picture", () => {
    const blank = asset({ id: "nopics", asset_type: "location" });
    expect(assetReferences(blank, variants)).toEqual([]);
  });

  it("returns no references for a frame with no stored recipe", () => {
    const frame = asset({ id: "frame1", asset_type: "reference", rules_json: null });
    expect(assetReferences(frame, variants)).toEqual([]);
  });
});

describe("assetBasePrompt", () => {
  it("uses a frame's recipe prompt", () => {
    const frame = asset({
      asset_type: "reference",
      rules_json: JSON.stringify({ characters: [], location: null, locationVariantId: null, prompt: "the moment" }),
    });
    expect(assetBasePrompt(frame, {})).toBe("the moment");
  });

  it("uses a character's primary picture prompt", () => {
    const variants = { char1: [variant({ id: "p", asset_id: "char1", is_primary: true, prompt: "a hero" })] };
    expect(assetBasePrompt(asset({ id: "char1", asset_type: "character" }), variants)).toBe("a hero");
  });
});

describe("buildFrameOptions (one option per frame)", () => {
  it("returns one option per frame, using its primary/current take", () => {
    const frames = [asset({ id: "f1", asset_type: "reference", name: "Beach" })];
    const variants = {
      f1: [
        variant({ id: "t1", asset_id: "f1", is_primary: false, media_url: "asset://t1.png" }),
        variant({ id: "t2", asset_id: "f1", is_primary: true, media_url: "asset://t2.png", prompt: "wide shot at dawn" }),
      ],
    };
    expect(buildFrameOptions(frames, variants)).toEqual([
      { variantId: "t2", label: "Beach", url: "asset://t2.png", prompt: "wide shot at dawn" },
    ]);
  });

  it("falls back to the first picture when none is marked primary", () => {
    const frames = [asset({ id: "f1", asset_type: "reference", name: "Beach" })];
    const variants = { f1: [variant({ id: "t1", asset_id: "f1", is_primary: false, media_url: "asset://t1.png" })] };
    expect(buildFrameOptions(frames, variants)).toEqual([
      { variantId: "t1", label: "Beach", url: "asset://t1.png", prompt: "" },
    ]);
  });

  it("falls back to the recipe prompt when the take has none", () => {
    const frames = [
      asset({
        id: "f1",
        asset_type: "reference",
        name: "Beach",
        rules_json: JSON.stringify({ characters: [], location: null, locationVariantId: null, prompt: "Mara walks into the surf" }),
      }),
    ];
    const variants = { f1: [variant({ id: "t1", asset_id: "f1", prompt: null })] };
    expect(buildFrameOptions(frames, variants)[0].prompt).toBe("Mara walks into the surf");
  });

  it("skips frames with no usable picture and non-frame assets", () => {
    const frames = [
      asset({ id: "f1", asset_type: "reference", name: "Empty" }),
      asset({ id: "c1", asset_type: "character", name: "Alex" }),
    ];
    const variants = { f1: [variant({ id: "x", asset_id: "f1", media_url: null })], c1: [variant({ id: "y", asset_id: "c1" })] };
    expect(buildFrameOptions(frames, variants)).toEqual([]);
  });
});

describe("filterFrameOptions", () => {
  const opts = [
    { variantId: "a", label: "Beach sunset", url: null, prompt: "Mara stares at the waves" },
    { variantId: "b", label: "Office at night", url: null, prompt: "" },
  ];
  it("returns all options for an empty query", () => {
    expect(filterFrameOptions(opts, "")).toEqual(opts);
  });
  it("filters by case-insensitive substring of the label", () => {
    expect(filterFrameOptions(opts, "beach")).toEqual([opts[0]]);
    expect(filterFrameOptions(opts, "NIGHT")).toEqual([opts[1]]);
  });
  it("filters by case-insensitive substring of the prompt", () => {
    expect(filterFrameOptions(opts, "waves")).toEqual([opts[0]]);
    expect(filterFrameOptions(opts, "MARA")).toEqual([opts[0]]);
  });
  it("trims the query and returns nothing when nothing matches", () => {
    expect(filterFrameOptions(opts, "  office  ")).toEqual([opts[1]]);
    expect(filterFrameOptions(opts, "zzz")).toEqual([]);
  });
});

describe("builtFromLabel", () => {
  const characters = [asset({ id: "c1", name: "Alex" })];
  const locations = [asset({ id: "l1", name: "Beach", asset_type: "location" })];

  it("joins the character and location names", () => {
    const frame = asset({
      asset_type: "reference",
      rules_json: JSON.stringify({ characters: ["c1"], location: "l1", locationVariantId: "lv", prompt: "p" }),
    });
    expect(builtFromLabel(frame, characters, locations)).toBe("Alex · Beach");
  });

  it("returns null when nothing resolves", () => {
    const frame = asset({ asset_type: "reference", rules_json: null });
    expect(builtFromLabel(frame, characters, locations)).toBeNull();
  });
});
