import { z } from "zod";

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

const microusd = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveMicrousd = microusd.positive();
export const agentBudgetGrantInputSchema = z
  .strictObject({
    max_microusd: positiveMicrousd,
    per_request_cap_microusd: positiveMicrousd.optional(),
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
export type AgentBudgetGrantInput = z.infer<typeof agentBudgetGrantInputSchema>;
export const agentBudgetGrantSchema = z.strictObject({
  id: z.string().min(1),
  max_microusd: microusd,
  per_request_cap_microusd: microusd,
  allowed_models: z.array(z.string()).nullable(),
  granted_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
});
export const agentBudgetSchema = z.strictObject({
  grant: agentBudgetGrantSchema,
  committed_microusd: microusd,
  remaining_microusd: z.number().int(),
});
