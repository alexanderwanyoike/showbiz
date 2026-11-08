import type { DatabaseSync } from "node:sqlite";
import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import type { AgentJobStart, AgentQuoteRequest } from "../../shared/agent-generation";
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
  const quotes = createAgentQuotes({ plan, budget: options.budget });
  const ledger = createAgentJobLedger(options.deviceDb);
  ledger.recoverInterrupted();
  const jobs = createAgentJobs({
    ledger,
    quotes,
    budget: options.budget,
    resolve: plan,
    start: (job: AgentJobStart) => channel.request("start_job", job),
    usage: (job) => findAgentJobUsage(options.invoke, job),
    canEdit: options.canEdit,
  });
  return {
    respond: channel.respond,
    report(sender: number, update: unknown): Promise<void> {
      return sender === options.window()?.id ? jobs.report(update) : Promise.resolve();
    },
    commands: {
      quote_generation: (args?: Record<string, unknown>) => quotes.quote_generation(args),
      submit_generation: (args?: Record<string, unknown>) => jobs.submit_generation(args),
      get_generation_job: (args?: Record<string, unknown>) => jobs.get_generation_job(args),
      list_generation_jobs: (args?: Record<string, unknown>) => jobs.list_generation_jobs(args),
    },
  };
}
