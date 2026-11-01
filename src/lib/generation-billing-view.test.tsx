// @vitest-environment jsdom
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import UsagePage from "../pages/UsagePage";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./bridge", () => native);
vi.mock("../hooks/useAgentChanges", () => ({ useAgentChanges: () => {} }));
afterEach(cleanup);
it("refreshes provider receipts before displaying totals and explains pending charges", async () => {
  let checked = false;
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "sync_generation_charges") {
      checked = true;
      return {
        ok: true,
        value: {
          checked: 2,
          reported: 1,
          notes: [
            {
              request_id: "pending",
              message:
                "FAL billing access denied. This cost remains unconfirmed.",
            },
          ],
        },
      };
    }
    if (command === "get_generation_usage")
      return {
        ok: true,
        value: {
          total_count: 2,
          items: [
            {
              request_id: "paid",
              provider_request_id: "job",
              project_id: "film",
              provider: "fal",
              model_id: "flux",
              kind: "image",
              status: "completed",
              started_at: "2026-10-31T10:00:00Z",
              reported_microusd: checked ? 23000 : null,
              estimated_min_microusd: 25000,
              estimated_max_microusd: 25000,
            },
            {
              request_id: "pending",
              provider_request_id: "pending-job",
              project_id: "film",
              provider: "fal",
              model_id: "flux",
              kind: "image",
              status: "failed",
              started_at: "2026-10-31T10:00:00Z",
              reported_microusd: null,
              estimated_min_microusd: 25000,
              estimated_max_microusd: 25000,
            },
          ],
        },
      };
    if (command === "get_generation_cost_summary")
      return {
        ok: true,
        value: {
          reported_microusd: checked ? 23000 : 0,
          estimated_min_microusd: 25000,
          estimated_max_microusd: 25000,
          unknown_count: 0,
          total_count: 2,
        },
      };
    throw new Error("Unexpected command");
  });
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/usage/film"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/usage/:id",
          element: createElement(UsagePage),
        }),
      ),
    ),
  );
  expect(await screen.findByText("$0.023 reported")).toBeTruthy();
  expect(screen.getByText("Charge unconfirmed")).toBeTruthy();
  const pendingRow = screen.getByText("Charge unconfirmed").closest("tr");
  expect(pendingRow).not.toBeNull();
  fireEvent.click(
    within(pendingRow!).getByRole("button", { name: "View request details" }),
  );
  expect(
    within(
      await screen.findByRole("dialog", { name: "Request details" }),
    ).getByText("FAL billing access denied. This cost remains unconfirmed."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Refresh charges" })).toBeTruthy();
});
it("shows charge refresh progress and prevents duplicate refresh requests", () => {
  native.invoke.mockImplementation(() => new Promise(() => {}));
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/usage/film"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/usage/:id",
          element: createElement(UsagePage),
        }),
      ),
    ),
  );
  expect(
    screen
      .getByRole("button", { name: "Checking charges…" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("renders recorded estimates while provider reconciliation is pending, then updates the receipt", async () => {
  let finish: ((value: unknown) => void) | undefined;
  let reported = false;
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "sync_generation_charges")
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (command === "get_generation_usage")
      return {
        ok: true,
        value: {
          total_count: 1,
          items: [
            {
              request_id: "fixture-pending",
              project_id: "film",
              provider: "fal",
              model_id: "flux-dev-fal",
              kind: "image",
              status: "completed",
              started_at: "2026-10-31T10:00:00Z",
              provider_request_id: "fixture-job",
              reported_microusd: reported ? 23000 : null,
              estimated_min_microusd: 25000,
              estimated_max_microusd: 25000,
            },
          ],
        },
      };
    if (command === "get_generation_cost_summary")
      return {
        ok: true,
        value: {
          reported_microusd: reported ? 23000 : 0,
          estimated_min_microusd: 25000,
          estimated_max_microusd: 25000,
          unknown_count: 0,
          total_count: 1,
        },
      };
    throw new Error("Unexpected command");
  });
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/usage/film"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/usage/:id",
          element: createElement(UsagePage),
        }),
      ),
    ),
  );
  expect(await screen.findByText("~$0.025 estimated")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Checking charges…" })
      .hasAttribute("disabled"),
  ).toBe(true);
  const { act } = await import("@testing-library/react");
  await act(async () => {
    reported = true;
    finish?.({ ok: true, value: { checked: 1, reported: 1, notes: [] } });
  });
  expect(await screen.findByText("$0.023 reported")).toBeTruthy();
});

it("keeps existing rows visible and prevents another refresh while rereading the local ledger", async () => {
  let reads = 0;
  let finish: ((value: unknown) => void) | undefined;
  const page = {
    ok: true,
    value: {
      total_count: 1,
      items: [
        {
          request_id: "fixture-reported",
          project_id: "film",
          provider: "fal",
          model_id: "flux-dev-fal",
          kind: "image",
          status: "completed",
          started_at: "2026-10-31T10:00:00Z",
          provider_request_id: "fixture-job",
          reported_microusd: 0,
          estimated_min_microusd: null,
          estimated_max_microusd: null,
        },
      ],
    },
  };
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "get_generation_usage")
      return ++reads === 1
        ? page
        : new Promise((resolve) => {
            finish = resolve;
          });
    if (command === "get_generation_cost_summary")
      return {
        ok: true,
        value: {
          reported_microusd: 0,
          estimated_min_microusd: 0,
          estimated_max_microusd: 0,
          unknown_count: 0,
          total_count: 1,
        },
      };
    throw new Error("Unexpected command");
  });
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/usage/film"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/usage/:id",
          element: createElement(UsagePage),
        }),
      ),
    ),
  );
  await screen.findByText("$0.00 reported");
  fireEvent.click(screen.getByRole("button", { name: "Refresh charges" }));
  expect(screen.getByText("$0.00 reported")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Checking charges…" })
      .hasAttribute("disabled"),
  ).toBe(true);
  const { act } = await import("@testing-library/react");
  await act(async () => {
    finish?.(page);
  });
  expect(
    await screen.findByRole("button", { name: "Refresh charges" }),
  ).toBeTruthy();
});
