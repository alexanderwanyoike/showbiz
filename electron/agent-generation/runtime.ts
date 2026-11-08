import type { DatabaseSync } from "node:sqlite";
import {
  agentFailure,
  mediaPreviewSchema,
  type AgentJobStart,
  type AgentQuoteRequest,
} from "../../shared/agent-generation";
import { createAgentJobLedger } from "./job-ledger";
import { createAgentJobs } from "./jobs";
import { createRendererChannel, type AgentWindow } from "./renderer-channel";
import { findAgentJobUsage } from "./usage-lookup";

export function createAgentGenerationRuntime(options: {
  window: () => AgentWindow | null;
  deviceDb: DatabaseSync;
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  canEdit: () => boolean;
}) {
  const channel = createRendererChannel({ target: options.window });
  const ledger = createAgentJobLedger(options.deviceDb);
  ledger.recoverInterrupted();
  const jobs = createAgentJobs({
    ledger,
    plan: (request: AgentQuoteRequest) => channel.request("plan_quote", request),
    start: (job: AgentJobStart) => channel.request("start_job", job),
    usage: (job) => findAgentJobUsage(options.invoke, job),
    canEdit: options.canEdit,
  });
  return {
    respond: channel.respond,
    report(sender: number, update: unknown): Promise<void> {
      return sender === options.window()?.id ? jobs.report(update) : Promise.resolve();
    },
    abandon(windowId: number): void {
      channel.abandon(windowId);
      jobs.interruptUnfinished();
    },
    commands: {
      set_shot_frame: (args?: Record<string, unknown>) =>
        channel.request("set_shot_frame", args ?? {}),
      get_media_preview: async (args?: Record<string, unknown>) => {
        const answer = await channel.request("preview_media", args ?? {});
        if (!answer.ok) return answer;
        const preview = mediaPreviewSchema.safeParse(answer.value);
        return preview.success
          ? { ok: true, value: preview.data }
          : agentFailure("IO_ERROR", "Showbiz returned an unreadable preview.");
      },
      generate: (args?: Record<string, unknown>) => jobs.generate(args),
      get_generation_job: (args?: Record<string, unknown>) => jobs.get_generation_job(args),
      list_generation_jobs: (args?: Record<string, unknown>) => jobs.list_generation_jobs(args),
    },
  };
}
