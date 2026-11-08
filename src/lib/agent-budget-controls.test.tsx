// @vitest-environment jsdom
import { createElement, Fragment } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import path from "node:path";
import { createAgentBudgetCommands } from "../../electron/commands/agent-budget";
import { createGenerationModelCommands } from "../../electron/commands/generation-models";
import { AgentBudgetDialog } from "../components/AgentBudgetDialog";
import { AgentBudgetBanner } from "../components/AgentBudgetBanner";
import { usdToMicrousd } from "./agent-budget";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./bridge", () => native);
afterEach(cleanup);

function device() {
  const commands: Record<string, (args?: Record<string, unknown>) => unknown> =
    createAgentBudgetCommands(openTestDb(), {
      readModels: createGenerationModelCommands(
        path.resolve("src/lib/models/providers"),
      ).get_generation_models,
    });
  native.invoke.mockImplementation(async (command: string, args) =>
    commands[command]?.(args),
  );
  return commands;
}

it("grants an agent budget in the app and shows what is left until it is revoked", async () => {
  const commands = device();
  render(
    createElement(
      Fragment,
      null,
      createElement(AgentBudgetBanner),
      createElement(AgentBudgetDialog),
    ),
  );
  const user = userEvent.setup();
  expect(screen.queryByRole("status", { name: "Agent budget" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "Agent budget" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Budget (USD)"), "5");
  await user.type(within(dialog).getByLabelText("Per request, at most (USD)"), "0.5");
  await user.selectOptions(within(dialog).getByLabelText("Lasts"), "1 day");
  await user.click(within(dialog).getByRole("button", { name: "Grant budget" }));

  expect(commands.get_agent_budget()).toMatchObject({
    ok: true,
    value: {
      grant: {
        max_microusd: 5_000_000,
        per_request_cap_microusd: 500_000,
        allowed_models: null,
      },
    },
  });
  const banner = await screen.findByRole("status", { name: "Agent budget" });
  expect(banner.textContent).toContain("$5.00 left of $5.00");

  await user.click(within(banner).getByRole("button", { name: "Revoke" }));
  expect(commands.get_agent_budget()).toMatchObject({
    ok: false,
    error: { code: "NO_BUDGET" },
  });
  expect(screen.queryByRole("status", { name: "Agent budget" })).toBeNull();
});

it("limits a grant to chosen models", async () => {
  const commands = device();
  render(createElement(AgentBudgetDialog));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Agent budget" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Budget (USD)"), "1");
  await user.click(within(dialog).getByLabelText("Only allow chosen models"));
  await user.click(
    within(dialog).getAllByRole("checkbox", { name: /Nano Banana 2/ })[0],
  );
  await user.click(within(dialog).getByRole("button", { name: "Grant budget" }));
  expect(commands.get_agent_budget()).toMatchObject({
    ok: true,
    value: { grant: { allowed_models: [expect.any(String) as string] } },
  });
});

it("refuses an empty budget without saving anything", async () => {
  const commands = device();
  render(createElement(AgentBudgetDialog));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Agent budget" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Grant budget" }));
  expect(await within(dialog).findByRole("alert")).toBeTruthy();
  expect(commands.get_agent_budget()).toMatchObject({ ok: false });
});

it("shows the expiry date so a week-long budget is not mistaken for today", async () => {
  const commands = device();
  commands.grant_agent_budget({ max_microusd: 1_000_000, duration_minutes: 60 * 24 * 7 });
  render(createElement(AgentBudgetBanner));
  const banner = await screen.findByRole("status", { name: "Agent budget" });
  const grant = (commands.get_agent_budget() as { value: { grant: { expires_at: string } } }).value.grant;
  const expires = new Date(grant.expires_at);
  expect(banner.textContent).toContain(
    expires.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  );
});

it("tells the user when the budget cannot be read", async () => {
  native.invoke.mockImplementation(async () => ({
    ok: false,
    error: { code: "IO_ERROR", message: "The saved agent budget is unreadable." },
  }));
  render(createElement(AgentBudgetBanner));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "The saved agent budget is unreadable.",
  );
});

it("hides the banner when the budget expires", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const commands = device();
    commands.grant_agent_budget({ max_microusd: 1_000_000, duration_minutes: 60 });
    render(createElement(AgentBudgetBanner));
    await screen.findByRole("status", { name: "Agent budget" });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1000);
    expect(screen.queryByRole("status", { name: "Agent budget" })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("reads only plain decimal dollar amounts", () => {
  expect(usdToMicrousd("5")).toBe(5_000_000);
  expect(usdToMicrousd("0.25")).toBe(250_000);
  for (const text of ["0x10", "1e3", "-1", "0", "", "1.2345678", "abc"])
    expect(usdToMicrousd(text)).toBeNull();
});

it("drops a budget that expired before Revoke was pressed, from the banner and the dialog", async () => {
  const commands = device();
  commands.grant_agent_budget({ max_microusd: 1_000_000, duration_minutes: 60 });
  render(
    createElement(
      Fragment,
      null,
      createElement(AgentBudgetBanner),
      createElement(AgentBudgetDialog),
    ),
  );
  const user = userEvent.setup();
  const banner = await screen.findByRole("status", { name: "Agent budget" });
  commands.revoke_agent_budget();
  await user.click(within(banner).getByRole("button", { name: "Revoke" }));
  await vi.waitFor(() =>
    expect(screen.queryByRole("status", { name: "Agent budget" })).toBeNull(),
  );
  expect(screen.queryByRole("alert")).toBeNull();

  commands.grant_agent_budget({ max_microusd: 1_000_000, duration_minutes: 60 });
  await user.click(screen.getByRole("button", { name: "Agent budget" }));
  const dialog = await screen.findByRole("dialog");
  const revoke = await within(dialog).findByRole("button", { name: "Revoke" });
  commands.revoke_agent_budget();
  await user.click(revoke);
  await vi.waitFor(() =>
    expect(within(dialog).queryByRole("button", { name: "Revoke" })).toBeNull(),
  );
});
