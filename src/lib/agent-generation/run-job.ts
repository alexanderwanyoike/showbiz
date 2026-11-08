import { generateImageAction } from "../../actions/generation-actions";
import { withApplicationWork } from "../application-work";
import { addPrimaryBibleTake, prepareBibleImageDataUrl } from "../bible-takes";
import { composeBibleImage, editBibleImage } from "../bible-generation";
import type {
  AgentJobReport,
  AgentJobStart,
} from "../../../shared/agent-generation";

async function createPicture({ request, plan, job_id, usage_request_id }: AgentJobStart) {
  const agent = { request_id: usage_request_id, agent_job_id: job_id, estimate: plan.estimate };
  const { inputs } = plan;
  if (request.operation === "edit") {
    const edited = await editBibleImage(
      request.source_variant_id,
      inputs.prompt,
      plan.model_id,
      plan.subject,
      agent,
    );
    if (!edited.ok) throw new Error(edited.error.message);
    return edited.value;
  }
  if (request.operation === "retake")
    return composeBibleImage(
      inputs.reference_variant_ids,
      inputs.prompt,
      plan.model_id,
      plan.subject,
      agent,
    );
  return prepareBibleImageDataUrl(
    await generateImageAction(inputs.prompt, plan.model_id, plan.subject, agent),
  );
}

export async function runAgentJob(
  job: AgentJobStart,
  report: (update: AgentJobReport) => Promise<void>,
): Promise<void> {
  try {
    await report({ job_id: job.job_id, status: "running" });
    const variant = await withApplicationWork("generation", async () =>
      addPrimaryBibleTake(
        job.request.asset_id,
        await createPicture(job),
        job.plan.inputs.prompt,
        job.plan.model_id,
      ),
    );
    await report({
      job_id: job.job_id,
      status: "completed",
      result: { variant_id: variant.id },
      warnings: [],
    });
  } catch (cause) {
    await report({
      job_id: job.job_id,
      status: "failed",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
