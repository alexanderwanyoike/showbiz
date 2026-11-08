import type { AgentBudget, AgentBudgetResult } from "../../shared/agent-budget";
import type { AgentQuoteRequest } from "../../shared/agent-generation";
import { createAgentQuotes } from "./quotes";
import { createRendererChannel, type AgentWindow } from "./renderer-channel";

export function createAgentGenerationRuntime(options: {
  window: () => AgentWindow | null;
  budget: () => Promise<AgentBudgetResult<AgentBudget>>;
}) {
  const channel = createRendererChannel({ target: options.window });
  const quotes = createAgentQuotes({
    plan: (request: AgentQuoteRequest) =>
      channel.request("plan_quote", request),
    budget: options.budget,
  });
  return {
    respond: channel.respond,
    commands: {
      quote_generation: (args?: Record<string, unknown>) =>
        quotes.quote_generation(args),
    },
  };
}
