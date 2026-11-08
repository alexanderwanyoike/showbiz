import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AGENT_REQUEST_CHANNEL,
  agentFailure,
  agentGenerationErrorCodes,
  type AgentResult,
} from "../../shared/agent-generation";

export interface AgentWindow {
  id: number;
  send(channel: string, payload: unknown): void;
}

const answerSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(agentGenerationErrorCodes),
      message: z.string(),
    }),
  }),
]);
const unavailable = (message: string) => agentFailure("UNAVAILABLE", message);

export function createRendererChannel(options: {
  target: () => AgentWindow | null;
  timeoutMs?: number;
}) {
  const pending = new Map<
    string,
    { owner: number; settle: (result: AgentResult<unknown>) => void }
  >();
  return {
    request(operation: string, input: unknown): Promise<AgentResult<unknown>> {
      const target = options.target();
      if (!target)
        return Promise.resolve(
          unavailable("Open Showbiz with a project before asking for generation."),
        );
      const request_id = randomUUID();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(request_id);
          resolve(unavailable("Showbiz did not answer in time. Try again."));
        }, options.timeoutMs ?? 60_000);
        pending.set(request_id, {
          owner: target.id,
          settle: (result) => {
            clearTimeout(timer);
            pending.delete(request_id);
            resolve(result);
          },
        });
        try {
          target.send(AGENT_REQUEST_CHANNEL, { request_id, operation, input });
        } catch (cause) {
          console.error("Could not send agent work to the window:", cause);
          pending.get(request_id)?.settle(
            unavailable("The Showbiz window is not responding."),
          );
        }
      });
    },
    respond(sender: number, requestId: string, answer: unknown): void {
      const entry = pending.get(requestId);
      if (!entry || entry.owner !== sender) return;
      const parsed = answerSchema.safeParse(answer);
      entry.settle(
        parsed.success
          ? parsed.data
          : agentFailure("IO_ERROR", "Showbiz returned an unreadable answer."),
      );
    },
  };
}
