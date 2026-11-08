import { useState } from "react";
import { Ban, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentBudget } from "../hooks/useAgentBudget";
import { formatBudgetExpiry, revokeAgentBudget } from "../lib/agent-budget";
import { formatGenerationCost } from "../lib/generation-usage";

export function AgentBudgetBanner() {
  const { budget, error: loadError, refresh } = useAgentBudget();
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  if (!budget)
    return loadError ? (
      <div role="alert" className="agent-budget-banner">
        <Bot size={14} aria-hidden="true" />
        <span>Agent budget unavailable. {loadError}</span>
      </div>
    ) : null;
  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      const result = await revokeAgentBudget();
      if (!result.ok) {
        if (result.error.code !== "NO_BUDGET") setError(result.error.message);
        await refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRevoking(false);
    }
  }
  return (
    <div role="status" aria-label="Agent budget" className="agent-budget-banner">
      <Bot size={14} aria-hidden="true" />
      {budget.frozen ? (
        <span>
          Agent budget frozen because a charge exceeded its quote. Grant a new
          budget to let the agent continue.
        </span>
      ) : (
        <span>
          Agent budget: {formatGenerationCost(budget.remaining_microusd)} left
          of {formatGenerationCost(budget.grant.max_microusd)}, until{" "}
          {formatBudgetExpiry(budget.grant.expires_at)}
        </span>
      )}
      {error && <span role="alert">{error}</span>}
      <Button
        variant="ghost"
        size="sm"
        className="agent-budget-revoke"
        disabled={revoking}
        onClick={() => void revoke()}
      >
        <Ban size={15} aria-hidden="true" />
        Revoke
      </Button>
    </div>
  );
}
