import { generateImageAction } from "../../actions/generation-actions";
import { withApplicationWork } from "../application-work";
import { getCurrentImageVersion } from "../backend-api";
import { addPrimaryBibleTake, prepareBibleImageDataUrl } from "../bible-takes";
import { composeBibleImage, editBibleImage } from "../bible-generation";
import { editShotStartFrame, generateShotStartFrame } from "../shot-frames";
import type {
  AgentJobReport,
  AgentJobResult,
  AgentJobStart,
} from "../../../shared/agent-generation";

type BibleJob = AgentJobStart & { request: { target: "bible_asset" } };

const accountingFor = (job: AgentJobStart) => ({
  request_id: job.usage_request_id,
  agent_job_id: job.job_id,
  estimate: job.plan.estimate,
});

async function createBiblePicture(job: BibleJob) {
  const { request, plan } = job;
  const agent = accountingFor(job);
  const { inputs } = plan;
  if (request.operation === "edit") {
    if (!inputs.source_variant_id) throw new Error("The quote has no source picture to edit.");
    const edited = await editBibleImage(
      inputs.source_variant_id,
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

async function createResult(job: AgentJobStart): Promise<AgentJobResult> {
  const { request, plan } = job;
  if (request.target === "bible_asset") {
    const variant = await addPrimaryBibleTake(
      request.asset_id,
      await createBiblePicture({ ...job, request }),
      plan.inputs.prompt,
      plan.model_id,
    );
    return { variant_id: variant.id };
  }
  const agent = accountingFor(job);
  if (request.operation === "edit") {
    const sourceTake = plan.inputs.source_take_id;
    if (!sourceTake) throw new Error("The quote has no source take to edit.");
    const take = await editShotStartFrame(
      request.shot_id,
      sourceTake,
      plan.inputs.prompt,
      plan.model_id,
      plan.subject,
      agent,
    );
    return { take_id: take.id };
  }
  const take = await generateShotStartFrame(
    request.shot_id,
    plan.inputs.prompt,
    plan.model_id,
    plan.subject,
    (await getCurrentImageVersion(request.shot_id))?.id ?? null,
    agent,
  );
  return { take_id: take.id };
}

export async function runAgentJob(
  job: AgentJobStart,
  report: (update: AgentJobReport) => Promise<void>,
): Promise<void> {
  try {
    await report({ job_id: job.job_id, status: "running" });
    const result = await withApplicationWork("generation", () => createResult(job));
    await report({ job_id: job.job_id, status: "completed", result, warnings: [] });
  } catch (cause) {
    await report({
      job_id: job.job_id,
      status: "failed",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
