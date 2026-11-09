import {
  agentFailure,
  agentQuotePlanSchema,
  type AgentQuotePlan,
  type AgentQuoteRequest,
  type AgentResult,
} from "../../shared/agent-generation";
import { imageGenerationKind } from "../../shared/generation-cost";

function matchesRequest(request: AgentQuoteRequest, plan: AgentQuotePlan) {
  const { kind } = plan.cost_request;
  const { inputs } = plan;
  if (request.target === "shot_video")
    return (
      kind === "video" &&
      inputs.video !== undefined &&
      inputs.reference_variant_ids.length === 0 &&
      plan.subject.subject_id === request.shot_id
    );
  const composes = inputs.reference_variant_ids.length > 0;
  const edit = request.operation === "edit";
  const kindFits =
    kind === imageGenerationKind({ edit, composes }) &&
    (request.operation === "retake" || !composes);
  const promptFits =
    request.prompt === undefined ? inputs.prompt.length > 0 : inputs.prompt === request.prompt;
  if (request.target === "shot_start_frame")
    return (
      kindFits &&
      promptFits &&
      plan.subject.subject_id === request.shot_id &&
      (request.operation !== "edit" || inputs.source_take_id === request.source_take_id)
    );
  return (
    kindFits &&
    promptFits &&
    plan.model_id === request.model_id &&
    plan.subject.subject_id === request.asset_id &&
    (request.operation !== "edit" || inputs.source_variant_id === request.source_variant_id)
  );
}

/** Accepts the window's plan only when it is what the agent asked for. */
export function readPlan(request: AgentQuoteRequest, answer: unknown): AgentResult<AgentQuotePlan> {
  const parsed = agentQuotePlanSchema.safeParse(answer);
  if (
    !parsed.success ||
    !matchesRequest(request, parsed.data) ||
    (parsed.data.estimate.kind === "estimate" &&
      (parsed.data.estimate.price.model_id !== parsed.data.model_id ||
        parsed.data.estimate.price.provider !== parsed.data.provider))
  )
    return agentFailure("IO_ERROR", "Showbiz returned an inconsistent generation plan.");
  return { ok: true, value: parsed.data };
}
