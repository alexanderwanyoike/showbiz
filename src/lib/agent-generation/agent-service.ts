import {
  agentFailure,
  agentJobStartSchema,
  agentQuoteRequestSchema,
  type AgentJobReport,
  type AgentRequest,
  type AgentResult,
} from "../../../shared/agent-generation";
import { planAgentQuote } from "./plan-quote";
import { runAgentJob } from "./run-job";

const invalid = (issue: { message: string } | undefined) =>
  agentFailure("INVALID_INPUT", issue?.message ?? "Invalid agent request.");

async function handle(
  request: AgentRequest,
  report: (update: AgentJobReport) => Promise<void>,
): Promise<AgentResult<unknown>> {
  if (request.operation === "plan_quote") {
    const input = agentQuoteRequestSchema.safeParse(request.input);
    return input.success ? planAgentQuote(input.data) : invalid(input.error.issues[0]);
  }
  if (request.operation === "start_job") {
    const input = agentJobStartSchema.safeParse(request.input);
    if (!input.success) return invalid(input.error.issues[0]);
    void runAgentJob(input.data, report);
    return { ok: true, value: null };
  }
  return agentFailure("INVALID_INPUT", "Unknown agent operation.");
}

export function connectAgentService(): () => void {
  const bridge = window.showbiz;
  if (!bridge?.onAgentRequest || !bridge.respondAgentRequest || !bridge.reportAgentJob)
    return () => {};
  const respond = bridge.respondAgentRequest;
  const send = bridge.reportAgentJob;
  const report = async (update: AgentJobReport) => {
    await send(update).catch((cause: unknown) =>
      console.error("Could not report agent job progress:", cause),
    );
    if (update.status === "completed")
      window.dispatchEvent(new Event("showbiz:project-changed"));
  };
  return bridge.onAgentRequest((request) => {
    void handle(request, report)
      .catch((cause: unknown) =>
        agentFailure(
          "IO_ERROR",
          cause instanceof Error ? cause.message : String(cause),
        ),
      )
      .then((answer) => respond(request.request_id, answer))
      .catch((cause: unknown) =>
        console.error("Could not answer an agent request:", cause),
      );
  });
}
