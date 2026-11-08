import { expect, it } from "vitest";
import { readAgentBudgetResult } from "../../shared/agent-budget";

it("accepts only a well-formed budget answer", () => {
  const budget = {
    grant: {
      id: "grant",
      max_microusd: 1_000_000,
      per_request_cap_microusd: 1_000_000,
      allowed_models: null,
      granted_at: "2026-11-08T09:00:00.000Z",
      expires_at: "2026-11-09T09:00:00.000Z",
      revoked_at: null,
    },
    committed_microusd: 0,
    remaining_microusd: 1_000_000,
    frozen: false,
  };
  expect(readAgentBudgetResult({ ok: true, value: budget })).toEqual({ ok: true, value: budget });
  expect(
    readAgentBudgetResult({ ok: false, error: { code: "NO_BUDGET", message: "none" } }),
  ).toMatchObject({ ok: false, error: { code: "NO_BUDGET" } });
  for (const malformed of [
    undefined,
    { ok: true, value: { ...budget, remaining_microusd: "lots" } },
    { ok: false, error: { code: "ROOT", message: "x" } },
  ])
    expect(readAgentBudgetResult(malformed)).toMatchObject({
      ok: false,
      error: { code: "IO_ERROR" },
    });
});
