import { describe, expect, it } from "vitest";
import { openTestDb } from "../db.test";
import { createAgentBudgetCommands } from "./agent-budget";

const HOUR = 60 * 60 * 1000;

function setup(start = Date.parse("2026-11-08T10:00:00.000Z")) {
  let now = start;
  const commands = createAgentBudgetCommands(openTestDb(), () => now);
  return {
    commands,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("agent budget grants", () => {
  it("reports no budget until the user grants one", () => {
    const { commands } = setup();
    expect(commands.get_agent_budget()).toMatchObject({
      ok: false,
      error: { code: "NO_BUDGET" },
    });
  });

  it("grants a budget with an expiry, per-request cap and model allowlist", () => {
    const { commands } = setup();
    const granted = commands.grant_agent_budget({
      max_microusd: 5_000_000,
      per_request_cap_microusd: 1_000_000,
      duration_minutes: 60,
      allowed_models: ["flux-schnell-fal"],
    });
    expect(granted).toMatchObject({ ok: true });
    expect(commands.get_agent_budget()).toEqual({
      ok: true,
      value: {
        grant: {
          id: expect.any(String) as string,
          max_microusd: 5_000_000,
          per_request_cap_microusd: 1_000_000,
          allowed_models: ["flux-schnell-fal"],
          granted_at: "2026-11-08T10:00:00.000Z",
          expires_at: "2026-11-08T11:00:00.000Z",
          revoked_at: null,
        },
        committed_microusd: 0,
        remaining_microusd: 5_000_000,
      },
    });
  });

  it("defaults the per-request cap to the maximum and allows any model", () => {
    const { commands } = setup();
    commands.grant_agent_budget({ max_microusd: 2_000_000, duration_minutes: 30 });
    expect(commands.get_agent_budget()).toMatchObject({
      ok: true,
      value: {
        grant: { per_request_cap_microusd: 2_000_000, allowed_models: null },
      },
    });
  });

  it("stops reporting a budget once it expires", () => {
    const { commands, advance } = setup();
    commands.grant_agent_budget({ max_microusd: 1_000_000, duration_minutes: 60 });
    advance(HOUR);
    expect(commands.get_agent_budget()).toMatchObject({
      ok: false,
      error: { code: "NO_BUDGET" },
    });
  });

  it("revokes the active budget immediately", () => {
    const { commands } = setup();
    commands.grant_agent_budget({ max_microusd: 1_000_000, duration_minutes: 60 });
    expect(commands.revoke_agent_budget()).toEqual({ ok: true, value: null });
    expect(commands.get_agent_budget()).toMatchObject({
      ok: false,
      error: { code: "NO_BUDGET" },
    });
  });

  it("replaces an earlier grant with a new identity", () => {
    const { commands } = setup();
    const first = commands.grant_agent_budget({
      max_microusd: 1_000_000,
      duration_minutes: 60,
    });
    const second = commands.grant_agent_budget({
      max_microusd: 3_000_000,
      duration_minutes: 60,
    });
    expect(first.ok && second.ok && first.value.id !== second.value.id).toBe(
      true,
    );
    expect(commands.get_agent_budget()).toMatchObject({
      ok: true,
      value: { grant: { max_microusd: 3_000_000 } },
    });
  });

  it.each([
    [{ max_microusd: 0, duration_minutes: 60 }],
    [{ max_microusd: 1.5, duration_minutes: 60 }],
    [{ max_microusd: 1_000_000, duration_minutes: 0 }],
    [{ max_microusd: 1_000_000, duration_minutes: 60 * 24 * 31 }],
    [
      {
        max_microusd: 1_000_000,
        per_request_cap_microusd: 2_000_000,
        duration_minutes: 60,
      },
    ],
    [{ max_microusd: 1_000_000, duration_minutes: 60, allowed_models: [] }],
    [{ max_microusd: 1_000_000, duration_minutes: 60, allowed_models: [""] }],
  ])("rejects an invalid grant %o", (input) => {
    const { commands } = setup();
    expect(commands.grant_agent_budget(input)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(commands.get_agent_budget()).toMatchObject({ ok: false });
  });
});
