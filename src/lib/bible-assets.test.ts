import { describe, expect, it } from "vitest";
import {
  buildGeneratedVariantName,
  buildVariantExportFilename,
  chooseVariantSource,
  dataUrlToBytes,
  extensionForDataUrl,
  findDefaultVariant,
  hasUsableShotVideoSource,
  resolveSelectedVariantId,
  getVariantGenerationFields,
} from "./bible-assets";

describe("buildGeneratedVariantName", () => {
  it("uses a compact prompt preview for generated variants", () => {
    expect(buildGeneratedVariantName("  turn Alexander into an anime character with a blue jacket  ")).toBe(
      "turn Alexander into an anime character with a blue"
    );
  });

  it("falls back when the prompt is empty", () => {
    expect(buildGeneratedVariantName("   ")).toBe("Generated variant");
  });
});

describe("getVariantGenerationFields", () => {
  it("loads saved prompt and model from a generated variant", () => {
    expect(
      getVariantGenerationFields(
        { prompt: "make anime", model_id: "flux-kontext-fal" },
        "nano-banana"
      )
    ).toEqual({ prompt: "make anime", modelId: "flux-kontext-fal" });
  });

  it("keeps the current model when the variant has no saved model", () => {
    expect(
      getVariantGenerationFields(
        { prompt: null, model_id: null },
        "nano-banana"
      )
    ).toEqual({ prompt: "", modelId: "nano-banana" });
  });
});

describe("chooseVariantSource", () => {
  it("uses the selected variant when it has media", () => {
    expect(
      chooseVariantSource(
        { id: "selected", media_url: "/selected.png" },
        { id: "primary", media_url: "/primary.png" }
      )
    ).toEqual({ id: "selected", media_url: "/selected.png" });
  });

  it("falls back to the primary variant when the selected variant has no media", () => {
    expect(
      chooseVariantSource(
        { id: "selected", media_url: null },
        { id: "primary", media_url: "/primary.png" }
      )
    ).toEqual({ id: "primary", media_url: "/primary.png" });
  });
});

describe("extensionForDataUrl", () => {
  it("maps common image data URLs to file extensions", () => {
    expect(extensionForDataUrl("data:image/jpeg;base64,abc")).toBe("jpg");
    expect(extensionForDataUrl("data:image/png;base64,abc")).toBe("png");
    expect(extensionForDataUrl("data:image/webp;base64,abc")).toBe("webp");
  });

  it("defaults to png for malformed data URLs", () => {
    expect(extensionForDataUrl("abc")).toBe("png");
  });
});

describe("buildVariantExportFilename", () => {
  it("builds a filesystem-safe variant filename", () => {
    expect(
      buildVariantExportFilename(
        "Alexander Wanyoike",
        { name: "anime / sitcom", source_kind: "edited", created_at: "2026-05-08 18:00:00" },
        "data:image/jpeg;base64,abc"
      )
    ).toBe("Alexander_Wanyoike_anime_sitcom.jpg");
  });
});

describe("dataUrlToBytes", () => {
  it("converts a base64 data URL to bytes", () => {
    expect(Array.from(dataUrlToBytes("data:image/png;base64,SGk="))).toEqual([72, 105]);
  });
});

describe("findDefaultVariant", () => {
  const variants = [
    { id: "candidate", is_primary: false, status: "candidate" },
    { id: "approved", is_primary: false, status: "approved" },
    { id: "primary", is_primary: true, status: "candidate" },
  ];

  it("prefers the primary variant", () => {
    expect(findDefaultVariant(variants)?.id).toBe("primary");
  });

  it("falls back to an approved variant", () => {
    expect(findDefaultVariant(variants.filter((variant) => !variant.is_primary))?.id).toBe("approved");
  });
});

describe("resolveSelectedVariantId", () => {
  const variants = [
    { id: "primary", is_primary: true, status: "approved" },
    { id: "other", is_primary: false, status: "candidate" },
  ];

  it("keeps a selected variant id that still exists", () => {
    expect(resolveSelectedVariantId("other", variants)).toBe("other");
  });

  it("falls back to the default when selected variant was deleted", () => {
    expect(resolveSelectedVariantId("missing", variants)).toBe("primary");
  });
});

describe("hasUsableShotVideoSource", () => {
  it("allows generation when a shot has an image", () => {
    expect(hasUsableShotVideoSource({ imageUrl: "asset://shot.png", selectedRefs: [] })).toBe(true);
  });

  it("allows generation when a Bible reference variant is selected", () => {
    expect(
      hasUsableShotVideoSource({
        imageUrl: null,
        selectedRefs: [{ asset_id: "asset", variant_id: "variant" }],
      })
    ).toBe(true);
  });

  it("blocks generation when there is no image and no selected variant reference", () => {
    expect(hasUsableShotVideoSource({ imageUrl: null, selectedRefs: [] })).toBe(false);
  });
});
