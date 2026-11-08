import { useState } from "react";
import { Bot } from "lucide-react";
import { useAgentBudget } from "../hooks/useAgentBudget";
import { revokeAgentBudget } from "../lib/agent-budget";
import { formatGenerationCost } from "../lib/generation-usage";

export function formatBudgetExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentBudgetBanner() {
  const { budget } = useAgentBudget();
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  if (!budget) return null;
  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      const result = await revokeAgentBudget();
      if (!result.ok) setError(result.error.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRevoking(false);
    }
  }
  return (
    <div role="status" aria-label="Agent budget" className="agent-budget-banner">
      <Bot size={14} aria-hidden="true" />
      <span>
        Agent budget: {formatGenerationCost(budget.remaining_microusd)} left of{" "}
        {formatGenerationCost(budget.grant.max_microusd)}, until{" "}
        {formatBudgetExpiry(budget.grant.expires_at)}
      </span>
      {error && <span role="alert">{error}</span>}
      <button type="button" disabled={revoking} onClick={() => void revoke()}>
        Revoke
      </button>
    </div>
  );
}
