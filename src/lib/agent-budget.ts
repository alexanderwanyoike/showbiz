import { invoke } from "./bridge";
import type {
  AgentBudget,
  AgentBudgetGrant,
  AgentBudgetResult,
} from "../../shared/agent-budget";

const CHANGED = "showbiz:agent-budget-changed";

export const AGENT_BUDGET_DURATIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 60 * 24 },
  { label: "1 week", minutes: 60 * 24 * 7 },
] as const;

export interface AgentBudgetRequest {
  max_microusd: number;
  per_request_cap_microusd?: number;
  duration_minutes: number;
  allowed_models?: string[];
}

export function usdToMicrousd(text: string): number | null {
  const value = Number(text.trim());
  if (!text.trim() || !Number.isFinite(value) || value <= 0) return null;
  const amount = Math.round(value * 1_000_000);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export const getAgentBudget = () =>
  invoke<AgentBudgetResult<AgentBudget>>("get_agent_budget");

function announce<T>(result: AgentBudgetResult<T>) {
  if (result.ok) window.dispatchEvent(new Event(CHANGED));
  return result;
}

export const grantAgentBudget = async (request: AgentBudgetRequest) =>
  announce(
    await invoke<AgentBudgetResult<AgentBudgetGrant>>("grant_agent_budget", {
      ...request,
    }),
  );

export const revokeAgentBudget = async () =>
  announce(await invoke<AgentBudgetResult<null>>("revoke_agent_budget"));

export function onAgentBudgetChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
