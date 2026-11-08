// A frame's compose recipe, stored as JSON on the frame asset so the frame can
// be reproduced (retaken) or varied while keeping its characters and location.
export interface FrameRecipe {
  characters: string[]; // character asset ids (compose uses each one's primary picture)
  location: string | null; // location asset id (for display)
  locationVariantId: string | null; // the chosen location view (compose uses this picture)
  prompt: string;
}

export const frameName = (recipe: FrameRecipe) =>
  recipe.prompt.slice(0, 50) || "Frame";

export const frameRules = (recipe: FrameRecipe) =>
  JSON.stringify({
    characters: recipe.characters,
    location: recipe.location,
    locationVariantId: recipe.locationVariantId,
    prompt: recipe.prompt,
  });

/** The Bible entry the frame composer creates for a recipe. Frames use the "reference" type every schema allows. */
export function frameAssetInput(recipe: FrameRecipe) {
  return {
    asset_type: "reference" as const,
    name: frameName(recipe),
    summary: null,
    description: null,
    tags_json: null,
    rules_json: frameRules(recipe),
    consent_confirmed: false,
  };
}
