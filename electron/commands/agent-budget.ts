import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  AGENT_BUDGET_MAX_DURATION_MINUTES,
  agentBudgetGrantSchema,
  type AgentBudget,
  type AgentBudgetGrant,
  type AgentBudgetResult,
} from "../../shared/agent-budget";

const GRANT_KEY = "agent_budget_grant";
const microusd = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const grantInput = z
  .strictObject({
    max_microusd: microusd,
    per_request_cap_microusd: microusd.optional(),
    duration_minutes: z
      .number()
      .int()
      .positive()
      .max(AGENT_BUDGET_MAX_DURATION_MINUTES),
    allowed_models: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(200)
      .optional(),
  })
  .refine(
    (input) =>
      input.per_request_cap_microusd === undefined ||
      input.per_request_cap_microusd <= input.max_microusd,
    { message: "The per-request cap cannot exceed the budget." },
  );
const noBudget = (): AgentBudgetResult<never> => ({
  ok: false,
  error: {
    code: "NO_BUDGET",
    message:
      "No agent budget is active. Grant one in Showbiz under Usage & billing.",
  },
});

/** Device-only grant commands. Only the renderer may call grant and revoke; MCP reads the budget. */
export function createAgentBudgetCommands(
  db: DatabaseSync,
  now: () => number = Date.now,
) {
  function readGrant(): AgentBudgetGrant | null {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(GRANT_KEY) as { value: string } | undefined;
    return row ? agentBudgetGrantSchema.parse(JSON.parse(row.value)) : null;
  }
  function writeGrant(grant: AgentBudgetGrant) {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(GRANT_KEY, JSON.stringify(grant));
  }
  function activeGrant(): AgentBudgetGrant | null {
    const grant = readGrant();
    if (!grant || grant.revoked_at) return null;
    return Date.parse(grant.expires_at) > now() ? grant : null;
  }
  function guarded<T>(action: () => AgentBudgetResult<T>): AgentBudgetResult<T> {
    try {
      return action();
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            cause instanceof Error
              ? cause.message
              : "The agent budget could not be read.",
        },
      };
    }
  }
  return {
    get_agent_budget(): AgentBudgetResult<AgentBudget> {
      return guarded(() => {
        const grant = activeGrant();
        if (!grant) return noBudget();
        return {
          ok: true,
          value: {
            grant,
            committed_microusd: 0,
            remaining_microusd: grant.max_microusd,
          },
        };
      });
    },
    grant_agent_budget(
      args?: Record<string, unknown>,
    ): AgentBudgetResult<AgentBudgetGrant> {
      return guarded(() => {
        const input = grantInput.safeParse(args ?? {});
        if (!input.success)
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: input.error.issues[0]?.message ?? "Invalid budget.",
            },
          };
        const granted = now();
        const grant: AgentBudgetGrant = {
          id: randomUUID(),
          max_microusd: input.data.max_microusd,
          per_request_cap_microusd:
            input.data.per_request_cap_microusd ?? input.data.max_microusd,
          allowed_models: input.data.allowed_models
            ? [...new Set(input.data.allowed_models)]
            : null,
          granted_at: new Date(granted).toISOString(),
          expires_at: new Date(
            granted + input.data.duration_minutes * 60_000,
          ).toISOString(),
          revoked_at: null,
        };
        writeGrant(grant);
        return { ok: true, value: grant };
      });
    },
    revoke_agent_budget(): AgentBudgetResult<null> {
      return guarded(() => {
        const grant = activeGrant();
        if (!grant) return noBudget();
        writeGrant({ ...grant, revoked_at: new Date(now()).toISOString() });
        return { ok: true, value: null };
      });
    },
  };
}
