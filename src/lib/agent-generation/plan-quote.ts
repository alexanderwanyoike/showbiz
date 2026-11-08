import { invoke } from "../bridge";
import { getBibleAssets, getBibles } from "../backend-api";
import { getGenerationEstimate } from "../generation-pricing";
import { imageConfigs } from "../models/registry";
import {
  agentFailure,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentQuoteTarget,
  type AgentResult,
} from "../../../shared/agent-generation";
import { IMAGE_GENERATION_REQUEST } from "../../../shared/generation-cost";
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
    const asset = (await getBibleAssets(bible.id)).find(
      (candidate) => candidate.id === assetId,
    );
    if (asset) return asset;
  }
  return null;
}

/** Resolves what a request targets: the model and cost request the app's own controls would use. */
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
  const asset = await findProjectAsset(project.value, request.asset_id);
  if (!asset)
    return agentFailure("NOT_FOUND", "That Bible entry is not in the open project.");
  // Frames are stored as "reference" entries and are made by composition, which prices differently.
  if (asset.asset_type === "reference")
    return agentFailure(
      "INVALID_INPUT",
      "Frames are composed from Bible references rather than generated from a prompt.",
    );
  return {
    ok: true,
    value: {
      model_id: model.id,
      provider: model.apiKeyProvider,
      cost_request: IMAGE_GENERATION_REQUEST,
      subject: { project_id: project.value, subject_id: request.asset_id },
    },
  };
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
