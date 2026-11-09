import { invoke } from "./bridge";
import { getImageModel, getVideoModel } from "./models";
import { getGenerationEstimate } from "./generation-pricing";
import { runAccountedGeneration } from "./generation-accounting";
import type {
  GenerationCostEstimate,
  GenerationCostRequest,
} from "../../shared/generation-cost";
import type { GenerationObserver } from "../../shared/generation-output";
import type { GenerationUsage } from "../../shared/generation-usage";
import type {
  AgentGenerationIdentity,
  GenerationAccountingResult,
} from "./generation-accounting";
import type {
  DocumentResult,
  ProjectDocumentState,
} from "../../shared/project-document";

export interface GenerationSubject {
  project_id?: string;
  subject_id?: string;
}
/** An agent job records the estimate it was planned with, not a fresh one. */
export interface AgentAccounting extends AgentGenerationIdentity {
  estimate: GenerationCostEstimate;
}
export async function accountModelGeneration<T>(
  modelId: string,
  request: GenerationCostRequest,
  subject: GenerationSubject | undefined,
  operation: (observer: GenerationObserver) => Promise<T>,
  agent?: AgentAccounting,
): Promise<GenerationAccountingResult<T>> {
  try {
    let projectId = subject?.project_id;
    if (!projectId) {
      const state = await invoke<DocumentResult<ProjectDocumentState>>(
        "get_project_document_state",
      );
      if (!state.ok)
        return {
          ok: false,
          error: { code: "IO_ERROR", message: state.error.message },
        };
      projectId = state.value.current?.project_id;
    }
    if (!projectId)
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Open a project before generating media.",
        },
      };
    const model =
      request.kind === "video"
        ? getVideoModel(modelId)
        : getImageModel(modelId);
    const estimate =
      agent?.estimate ?? (await getGenerationEstimate(modelId, request));
    const settings: GenerationUsage["settings"] = {};
    for (const key of [
      "duration",
      "resolution",
      "audio",
      "width",
      "height",
      "count",
      "aspect_ratio",
      "mode",
      "has_end_frame",
    ] as const) {
      const value = request[key];
      if (value !== undefined) settings[key] = value;
    }
    return runAccountedGeneration(
      {
        project_id: projectId,
        subject_id: subject?.subject_id,
        provider: model.apiKeyProvider,
        model_id: modelId,
        kind: request.kind,
        settings,
      },
      estimate,
      operation,
      agent && {
        request_id: agent.request_id,
        agent_job_id: agent.agent_job_id,
      },
    );
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message:
          cause instanceof Error
            ? cause.message
            : "Could not record model generation usage.",
      },
    };
  }
}
