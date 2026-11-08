import { invoke } from "../bridge";
import {
  getBibleAssetVariants,
  getBibleAssets,
  getBibles,
  type BibleAsset,
  type BibleAssetVariant,
} from "../backend-api";
import {
  assetBasePrompt,
  assetReferences,
  parseRecipe,
  primaryPicture,
} from "../bible-compose";
import { getGenerationEstimate } from "../generation-pricing";
import { imageConfigs } from "../models/registry";
import {
  MAX_REFERENCE_PICTURES,
  agentFailure,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentQuoteTarget,
  type AgentResult,
} from "../../../shared/agent-generation";
import {
  imageCostRequest,
  imageGenerationKind,
  type ImageGenerationKind,
} from "../../../shared/generation-cost";
import type {
  DocumentResult,
  ProjectDocumentState,
} from "../../../shared/project-document";

async function openProjectId(): Promise<AgentResult<string>> {
  const state = await invoke<DocumentResult<ProjectDocumentState>>(
    "get_project_document_state",
  );
  if (!state.ok) return agentFailure("UNAVAILABLE", state.error.message);
  const projectId = state.value.current?.project_id;
  return projectId
    ? { ok: true, value: projectId }
    : agentFailure("UNAVAILABLE", "Open a project in Showbiz first.");
}

async function findProjectAsset(projectId: string, assetId: string) {
  for (const bible of await getBibles(projectId)) {
    const assets = await getBibleAssets(bible.id);
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (asset) return { asset, assets };
  }
  return null;
}

async function variantsOf(assets: BibleAsset[]) {
  const variants: Record<string, BibleAssetVariant[]> = {};
  for (const asset of assets) variants[asset.id] = await getBibleAssetVariants(asset.id);
  return variants;
}

/** Existing frame characters and locations the app would silently leave out of a composition for lack of a picture. Deleted entries are skipped, as the app skips them. */
function unpicturedReferences(
  asset: BibleAsset,
  assets: BibleAsset[],
  variants: Record<string, BibleAssetVariant[]>,
): string[] {
  if (asset.asset_type !== "reference") return [];
  const recipe = parseRecipe(asset.rules_json);
  return [...recipe.characters, ...(recipe.location ? [recipe.location] : [])]
    .filter((id) => assets.some((entry) => entry.id === id) && !primaryPicture(variants[id] ?? []))
    .map((id) => assets.find((entry) => entry.id === id)?.name ?? id);
}

/** Resolves what a request targets: the model, cost request, prompt and pictures the app's own controls would use. */
export async function resolveAgentTarget(
  request: AgentQuoteRequest,
): Promise<AgentResult<AgentQuoteTarget>> {
  const project = await openProjectId();
  if (!project.ok) return project;
  const model = imageConfigs.find(
    (config) => config.id === request.model_id && config.enabled,
  );
  if (!model)
    return agentFailure(
      "INVALID_INPUT",
      `${request.model_id} is not an available image model.`,
    );
  const found = await findProjectAsset(project.value, request.asset_id);
  if (!found)
    return agentFailure("NOT_FOUND", "That Bible entry is not in the open project.");
  const { asset } = found;
  const target = (kind: ImageGenerationKind, inputs: AgentQuoteTarget["inputs"]) => ({
    ok: true as const,
    value: {
      model_id: model.id,
      provider: model.apiKeyProvider,
      cost_request: imageCostRequest(kind),
      subject: { project_id: project.value, subject_id: asset.id },
      inputs,
    },
  });
  if (request.operation === "generate") {
    // Frames are stored as "reference" entries and are made by composition, which prices differently.
    if (asset.asset_type === "reference")
      return agentFailure(
        "INVALID_INPUT",
        "Frames are composed from Bible references; use operation retake.",
      );
    return target("image", { prompt: request.prompt, reference_variant_ids: [] });
  }
  const variants = await variantsOf(found.assets);
  if (request.operation === "edit") {
    if (!model.supportsEditing)
      return agentFailure("INVALID_INPUT", `${model.name} cannot edit pictures.`);
    if (!variants[asset.id]?.some((variant) => variant.id === request.source_variant_id && variant.media_url))
      return agentFailure("NOT_FOUND", "That picture is not one of this entry's takes.");
    return target("image_edit", {
      prompt: request.prompt,
      reference_variant_ids: [],
      source_variant_id: request.source_variant_id,
    });
  }
  const prompt = (request.prompt ?? assetBasePrompt(asset, variants)).trim();
  if (!prompt)
    return agentFailure("INVALID_INPUT", "This entry has no prompt to retake; pass one.");
  const missing = unpicturedReferences(asset, found.assets, variants);
  if (missing.length)
    return agentFailure(
      "INVALID_INPUT",
      `${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no picture yet. Give ${missing.length === 1 ? "it" : "them"} a picture before composing this frame.`,
    );
  const references = assetReferences(asset, variants);
  if (references.length > MAX_REFERENCE_PICTURES)
    return agentFailure(
      "INVALID_INPUT",
      `A composition can use at most ${MAX_REFERENCE_PICTURES} pictures.`,
    );
  if (references.length > 0 && !model.supportsComposition)
    return agentFailure(
      "INVALID_INPUT",
      `${model.name} cannot compose from reference pictures.`,
    );
  return target(imageGenerationKind({ edit: false, composes: references.length > 0 }), {
    prompt,
    reference_variant_ids: references,
  });
}

export async function planAgentQuote(
  request: AgentQuoteRequest,
): Promise<AgentResult<AgentQuotePlan>> {
  const target = await resolveAgentTarget(request);
  if (!target.ok) return target;
  return {
    ok: true,
    value: {
      ...target.value,
      estimate: await getGenerationEstimate(
        target.value.model_id,
        target.value.cost_request,
      ),
    },
  };
}
