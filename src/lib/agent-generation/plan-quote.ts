import { z } from "zod";
import { invoke } from "../bridge";
import { getAvailableVideoModels } from "../models";
import { resolveShotModels, resolveStoryboardModels } from "../shot-models";
import {
  getBibleAssetVariants,
  getBibleAssets,
  getBibles,
  getStoryboards,
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

/** Frame characters and locations the app would silently leave out of a composition for lack of a picture. */
function unpicturedReferences(
  asset: BibleAsset,
  assets: BibleAsset[],
  variants: Record<string, BibleAssetVariant[]>,
): string[] {
  if (asset.asset_type !== "reference") return [];
  const recipe = parseRecipe(asset.rules_json);
  return [...recipe.characters, ...(recipe.location ? [recipe.location] : [])]
    .filter((id) => !primaryPicture(variants[id] ?? []))
    .map((id) => assets.find((entry) => entry.id === id)?.name ?? "A referenced entry");
}

/** Resolves what a request targets: the model, cost request, prompt and pictures the app's own controls would use. */
type BibleRequest = Extract<AgentQuoteRequest, { target: "bible_asset" }>;
type ShotRequest = Extract<AgentQuoteRequest, { target: "shot_start_frame" }>;

export async function resolveAgentTarget(
  request: AgentQuoteRequest,
): Promise<AgentResult<AgentQuoteTarget>> {
  const project = await openProjectId();
  if (!project.ok) return project;
  return request.target === "shot_start_frame"
    ? resolveShotTarget(request, project.value)
    : resolveBibleTarget(request, project.value);
}

const shotSchema = z.object({
  id: z.string(),
  storyboard_id: z.string(),
  image_model: z.string().nullable(),
});
const versionNodeSchema: z.ZodType<{ version: { id: string }; children: unknown[] }> = z.object({
  version: z.object({ id: z.string() }),
  children: z.array(z.lazy(() => versionNodeSchema)),
});
const versionIds = (nodes: unknown[]): string[] =>
  z.array(versionNodeSchema).parse(nodes).flatMap((node) => [
    node.version.id,
    ...versionIds(node.children),
  ]);

async function findProjectShot(projectId: string, shotId: string) {
  for (const storyboard of await getStoryboards(projectId)) {
    const shots = z.array(shotSchema).parse(
      await invoke("get_shots", { storyboardId: storyboard.id }),
    );
    const shot = shots.find((candidate) => candidate.id === shotId);
    if (shot) return { shot, storyboard };
  }
  return null;
}

/** Shot frames use the shot's image model, or the storyboard default, exactly as the storyboard does. */
async function resolveShotTarget(
  request: ShotRequest,
  projectId: string,
): Promise<AgentResult<AgentQuoteTarget>> {
  const found = await findProjectShot(projectId, request.shot_id);
  if (!found) return agentFailure("NOT_FOUND", "That shot is not in the open project.");
  const defaults = resolveStoryboardModels(found.storyboard, getAvailableVideoModels());
  const modelId = resolveShotModels(found.shot, defaults).image_model;
  const model = imageConfigs.find((config) => config.id === modelId && config.enabled);
  if (!model)
    return agentFailure(
      "INVALID_INPUT",
      `The shot's image model ${modelId} is not available. Choose another with set_shot_models.`,
    );
  const edit = request.operation === "edit";
  if (edit && !model.supportsEditing)
    return agentFailure(
      "INVALID_INPUT",
      `${model.name} cannot edit pictures. Choose another image model with set_shot_models.`,
    );
  if (
    request.operation === "edit" &&
    !versionIds(await invoke("get_image_versions", { shotId: request.shot_id })).includes(
      request.source_take_id,
    )
  )
    return agentFailure("NOT_FOUND", "That take is not one of this shot's start frames.");
  return {
    ok: true,
    value: {
      model_id: model.id,
      provider: model.apiKeyProvider,
      cost_request: imageCostRequest(imageGenerationKind({ edit, composes: false })),
      subject: { project_id: projectId, subject_id: request.shot_id },
      inputs: {
        prompt: request.prompt,
        reference_variant_ids: [],
        ...(request.operation === "edit" ? { source_take_id: request.source_take_id } : {}),
      },
    },
  };
}

async function resolveBibleTarget(
  request: BibleRequest,
  projectId: string,
): Promise<AgentResult<AgentQuoteTarget>> {
  const model = imageConfigs.find(
    (config) => config.id === request.model_id && config.enabled,
  );
  if (!model)
    return agentFailure(
      "INVALID_INPUT",
      `${request.model_id} is not an available image model.`,
    );
  const found = await findProjectAsset(projectId, request.asset_id);
  if (!found)
    return agentFailure("NOT_FOUND", "That Bible entry is not in the open project.");
  const { asset } = found;
  const target = (kind: ImageGenerationKind, inputs: AgentQuoteTarget["inputs"]) => ({
    ok: true as const,
    value: {
      model_id: model.id,
      provider: model.apiKeyProvider,
      cost_request: imageCostRequest(kind),
      subject: { project_id: projectId, subject_id: asset.id },
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
