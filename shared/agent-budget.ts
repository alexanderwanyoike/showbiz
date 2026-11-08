export interface AgentBudgetGrant {
  id: string;
  max_microusd: number;
  per_request_cap_microusd: number;
  allowed_models: string[] | null;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AgentBudget {
  grant: AgentBudgetGrant;
  committed_microusd: number;
  remaining_microusd: number;
}

export type AgentBudgetErrorCode = "NO_BUDGET" | "INVALID_INPUT" | "IO_ERROR";

export type AgentBudgetResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AgentBudgetErrorCode; message: string } };

export const AGENT_BUDGET_MAX_DURATION_MINUTES = 60 * 24 * 30;
