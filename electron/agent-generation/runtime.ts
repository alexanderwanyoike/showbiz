import type { DatabaseSync } from "node:sqlite";
import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import {
  agentFailure,
  mediaPreviewSchema,
  type AgentJobStart,
  type AgentQuoteRequest,
} from "../../shared/agent-generation";
import { createAgentJobLedger } from "./job-ledger";
import { createAgentJobs } from "./jobs";
import { createAgentQuotes } from "./quotes";
import { createRendererChannel, type AgentWindow } from "./renderer-channel";
import { findAgentJobUsage } from "./usage-lookup";

export function createAgentGenerationRuntime(options: {
  window: () => AgentWindow | null;
  budget: () => Promise<AgentBudgetResult<AgentBudget>>;
  deviceDb: DatabaseSync;
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  canEdit: () => boolean;
}) {
  const channel = createRendererChannel({ target: options.window });
  const plan = (request: AgentQuoteRequest) => channel.request("plan_quote", request);
  // Charges confirmed after a job finished must count before any budget decision.
  const budget = async () => {
    await jobs.settle();
    return options.budget();
  };
  const resolve = (request: AgentQuoteRequest) => channel.request("resolve_target", request);
  const quotes = createAgentQuotes({ plan, resolve, budget });
  const ledger = createAgentJobLedger(options.deviceDb);
  ledger.recoverInterrupted();
  const jobs = createAgentJobs({
    ledger,
    quotes,
    budget: options.budget,
    resolve,
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
      get_agent_budget: () => budget(),
      set_shot_frame: (args?: Record<string, unknown>) =>
        channel.request("set_shot_frame", args ?? {}),
      add_bible_image: (args?: Record<string, unknown>) =>
        channel.request("add_bible_image", args ?? {}),
      get_media_preview: async (args?: Record<string, unknown>) => {
        const answer = await channel.request("preview_media", args ?? {});
        if (!answer.ok) return answer;
        const preview = mediaPreviewSchema.safeParse(answer.value);
        return preview.success
          ? { ok: true, value: preview.data }
          : agentFailure("IO_ERROR", "Showbiz returned an unreadable preview.");
      },
      quote_generation: (args?: Record<string, unknown>) => quotes.quote_generation(args),
      submit_generation: (args?: Record<string, unknown>) => jobs.submit_generation(args),
      get_generation_job: (args?: Record<string, unknown>) => jobs.get_generation_job(args),
      list_generation_jobs: (args?: Record<string, unknown>) => jobs.list_generation_jobs(args),
    },
  };
}
