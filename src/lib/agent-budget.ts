import { invoke } from "./bridge";
import type {
  AgentBudget,
  AgentBudgetGrant,
  AgentBudgetGrantInput,
  AgentBudgetResult,
} from "../../shared/agent-budget";

const CHANGED = "showbiz:agent-budget-changed";

export const AGENT_BUDGET_DURATIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 60 * 24 },
  { label: "1 week", minutes: 60 * 24 * 7 },
] as const;

export function usdToMicrousd(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!match) return null;
  const amount =
    Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function formatBudgetExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const getAgentBudget = () =>
  invoke<AgentBudgetResult<AgentBudget>>("get_agent_budget");

function announce<T>(result: AgentBudgetResult<T>) {
  if (result.ok) window.dispatchEvent(new Event(CHANGED));
  return result;
}

export const grantAgentBudget = async (request: AgentBudgetGrantInput) =>
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
