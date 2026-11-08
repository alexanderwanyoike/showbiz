import { useCallback, useEffect, useState } from "react";
import {
  agentBudgetSchema,
  type AgentBudget,
} from "../../shared/agent-budget";
import { getAgentBudget, onAgentBudgetChanged } from "../lib/agent-budget";
import { useAgentChanges } from "./useAgentChanges";

// Expiry happens without any event, so the active budget is re-read periodically.
const EXPIRY_CHECK_MS = 30_000;

export function useAgentBudget() {
  const [budget, setBudget] = useState<AgentBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const result = await getAgentBudget();
      if (result.ok) {
        const budget = agentBudgetSchema.safeParse(result.value);
        setBudget(budget.success ? budget.data : null);
        setError(
          budget.success ? null : "The agent budget could not be read.",
        );
      } else {
        setBudget(null);
        setError(result.error.code === "NO_BUDGET" ? null : result.error.message);
      }
    } catch (cause) {
      setBudget(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  useAgentChanges(refresh);
  useEffect(() => {
    void refresh();
    const stop = onAgentBudgetChanged(() => void refresh());
    const timer = window.setInterval(() => void refresh(), EXPIRY_CHECK_MS);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [refresh]);
  return { budget, error, refresh };
}
