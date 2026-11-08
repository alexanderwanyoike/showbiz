import { z } from "zod";
import { microusdSchema } from "./generation-price-schema";

const agentBudgetErrorCodes = ["NO_BUDGET", "INVALID_INPUT", "IO_ERROR"] as const;
export type AgentBudgetErrorCode = (typeof agentBudgetErrorCodes)[number];

export type AgentBudgetResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AgentBudgetErrorCode; message: string } };

export const AGENT_BUDGET_MAX_DURATION_MINUTES = 60 * 24 * 30;

const microusd = microusdSchema;
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
export type AgentBudgetGrant = z.infer<typeof agentBudgetGrantSchema>;
export type AgentBudget = z.infer<typeof agentBudgetSchema>;

const agentBudgetResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: agentBudgetSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum(agentBudgetErrorCodes),
      message: z.string(),
    }),
  }),
]);
export function readAgentBudgetResult(
  value: unknown,
): AgentBudgetResult<AgentBudget> {
  const parsed = agentBudgetResultSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : {
        ok: false,
        error: { code: "IO_ERROR", message: "The agent budget could not be read." },
      };
}
