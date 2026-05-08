import { describe, expect, it } from "vitest";
import { compileShotPrompt } from "./prompt-compiler";
import type { GenerationReference } from "./types";

const reference: GenerationReference = {
  id: "variant-1",
  assetId: "asset-1",
  kind: "character",
  mediaType: "image",
  label: "Mara Vale",
  data: "data:image/png;base64,abc",
  description: "oval face, black bob haircut, charcoal trench coat",
  rules: "Never change the scar above her left eyebrow.",
};

describe("compileShotPrompt", () => {
  it("combines shot intent with bible reference descriptions and aliases", () => {
    const result = compileShotPrompt({
      action: "walks into the rain-soaked alley",
      camera: "slow dolly in",
      mood: "tense noir",
      references: [reference],
      includeAliases: true,
    });

    expect(result.prompt).toContain("@Image1 is Mara Vale");
    expect(result.prompt).toContain("oval face");
    expect(result.prompt).toContain("Never change the scar");
    expect(result.prompt).toContain("walks into the rain-soaked alley");
    expect(result.references[0].promptAlias).toBe("@Image1");
  });

  it("includes variant prompt without injecting hard-coded style instructions", () => {
    const result = compileShotPrompt({
      action: "sits at a computer",
      references: [
        {
          ...reference,
          variantPrompt: "1990s Japanese anime cel animation, hand-drawn 2D, flat colors",
        },
      ],
      includeAliases: true,
    });

    expect(result.prompt).toContain("1990s Japanese anime cel animation");
    expect(result.prompt).not.toContain("Visual style:");
    expect(result.prompt).not.toContain("Do not convert reference images");
  });

  it("uses a prompt override as the final prompt while preserving aliased references", () => {
    const result = compileShotPrompt({
      action: "ignored",
      references: [reference],
      includeAliases: true,
      promptOverride: "Use @Image1. Mara looks over her shoulder.",
    });

    expect(result.prompt).toBe("Use @Image1. Mara looks over her shoulder.");
    expect(result.references[0].promptAlias).toBe("@Image1");
  });
});
