import { invoke } from "./bridge";
import { getImageModel, getVideoModel } from "./models";
import { getGenerationEstimate } from "./generation-pricing";
import { runAccountedGeneration } from "./generation-accounting";
import type { GenerationCostRequest } from "../../shared/generation-cost";
import type { GenerationObserver } from "../../shared/generation-output";
import type { GenerationUsage } from "../../shared/generation-usage";
import type { Result } from "../../shared/result";
import type { DocumentResult, ProjectDocumentState } from "../../shared/project-document";

export interface GenerationSubject { project_id?: string; subject_id?: string }
export async function accountModelGeneration<T>(modelId: string, request: GenerationCostRequest, subject: GenerationSubject | undefined, operation: (observer: GenerationObserver) => Promise<T>): Promise<Result<T>> {
  try {
    let projectId = subject?.project_id;
    if (!projectId) {
      const state = await invoke<DocumentResult<ProjectDocumentState>>("get_project_document_state");
      if (!state.ok) return {ok: false, error: {code: "IO_ERROR", message: state.error.message}};
      projectId = state.value.current?.project_id;
    }
    if (!projectId) return {ok: false, error: {code: "INVALID_INPUT", message: "Open a project before generating media."}};
    const model = request.kind === "video" ? getVideoModel(modelId) : getImageModel(modelId);
    const estimate = await getGenerationEstimate(modelId, request);
    const settings: GenerationUsage["settings"] = {};
    for (const key of ["duration", "resolution", "audio", "width", "height", "count", "aspect_ratio", "mode"] as const) {
      const value = request[key];
      if (value !== undefined) settings[key] = value;
    }
    return runAccountedGeneration({project_id: projectId, subject_id: subject?.subject_id, provider: model.apiKeyProvider, model_id: modelId, kind: request.kind, settings}, estimate, operation);
  } catch (cause) { return {ok: false, error: {code: "IO_ERROR", message: cause instanceof Error ? cause.message : "Could not record model generation usage."}}; }
}
