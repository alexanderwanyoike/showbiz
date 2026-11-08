import { generateImageAction } from "../../actions/generation-actions";
import { withApplicationWork } from "../application-work";
import { addPrimaryBibleTake, prepareBibleImageDataUrl } from "../bible-takes";
import type {
  AgentJobReport,
  AgentJobStart,
} from "../../../shared/agent-generation";

export async function runAgentJob(
  job: AgentJobStart,
  report: (update: AgentJobReport) => Promise<void>,
): Promise<void> {
  const { request, plan } = job;
  try {
    await report({ job_id: job.job_id, status: "running" });
    const variant = await withApplicationWork("generation", async () => {
      const raw = await generateImageAction(
        request.prompt,
        plan.model_id,
        plan.subject,
        {
          request_id: job.usage_request_id,
          agent_job_id: job.job_id,
          estimate: plan.estimate,
        },
      );
      return addPrimaryBibleTake(
        request.asset_id,
        await prepareBibleImageDataUrl(raw),
        request.prompt,
        plan.model_id,
      );
    });
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
