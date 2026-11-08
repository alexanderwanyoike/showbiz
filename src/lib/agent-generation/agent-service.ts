import {
  agentQuoteRequestSchema,
  type AgentRequest,
  type AgentResult,
} from "../../../shared/agent-generation";
import { planAgentQuote } from "./plan-quote";

async function handle(request: AgentRequest): Promise<AgentResult<unknown>> {
  if (request.operation !== "plan_quote")
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Unknown agent operation." },
    };
  const input = agentQuoteRequestSchema.safeParse(request.input);
  if (!input.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: input.error.issues[0]?.message ?? "Invalid quote request.",
      },
    };
  return planAgentQuote(input.data);
}

/** Answers agent work that the main process hands to this window. */
export function connectAgentService(): () => void {
  const bridge = window.showbiz;
  if (!bridge?.onAgentRequest || !bridge.respondAgentRequest) return () => {};
  const respond = bridge.respondAgentRequest;
  return bridge.onAgentRequest((request) => {
    void handle(request)
      .catch(
        (cause: unknown): AgentResult<never> => ({
          ok: false,
          error: {
            code: "IO_ERROR",
            message: cause instanceof Error ? cause.message : String(cause),
          },
        }),
      )
      .then((answer) => respond(request.request_id, answer))
      .catch((cause: unknown) =>
        console.error("Could not answer an agent request:", cause),
      );
  });
}
