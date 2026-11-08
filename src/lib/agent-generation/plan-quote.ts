import { invoke } from "../bridge";
import { getBibleAssets, getBibles } from "../backend-api";
import { getGenerationEstimate } from "../generation-pricing";
import { imageConfigs } from "../models/registry";
import type {
  AgentQuotePlan,
  AgentQuoteRequest,
  AgentResult,
} from "../../../shared/agent-generation";
import type { GenerationCostRequest } from "../../../shared/generation-cost";
import type {
  DocumentResult,
  ProjectDocumentState,
} from "../../../shared/project-document";

const failure = (
  code: "INVALID_INPUT" | "NOT_FOUND" | "UNAVAILABLE",
  message: string,
): AgentResult<never> => ({ ok: false, error: { code, message } });

export async function openProjectId(): Promise<AgentResult<string>> {
  const state = await invoke<DocumentResult<ProjectDocumentState>>(
    "get_project_document_state",
  );
  if (!state.ok) return failure("UNAVAILABLE", state.error.message);
  const projectId = state.value.current?.project_id;
  return projectId
    ? { ok: true, value: projectId }
    : failure("UNAVAILABLE", "Open a project in Showbiz first.");
}

async function projectHasAsset(projectId: string, assetId: string) {
  for (const bible of await getBibles(projectId))
    if ((await getBibleAssets(bible.id)).some((asset) => asset.id === assetId))
      return true;
  return false;
}

/** Resolves a quote request to the model, cost request and estimate the app's own controls would use. */
export async function planAgentQuote(
  request: AgentQuoteRequest,
): Promise<AgentResult<AgentQuotePlan>> {
  const project = await openProjectId();
  if (!project.ok) return project;
  const model = imageConfigs.find(
    (config) => config.id === request.model_id && config.enabled,
  );
  if (!model)
    return failure(
      "INVALID_INPUT",
      `${request.model_id} is not an available image model.`,
    );
  if (!(await projectHasAsset(project.value, request.asset_id)))
    return failure("NOT_FOUND", "That Bible entry is not in the open project.");
  const cost_request: GenerationCostRequest = { kind: "image", count: 1 };
  return {
    ok: true,
    value: {
      model_id: model.id,
      provider: model.apiKeyProvider,
      cost_request,
      subject: { project_id: project.value, subject_id: request.asset_id },
      estimate: await getGenerationEstimate(model.id, cost_request),
    },
  };
}
