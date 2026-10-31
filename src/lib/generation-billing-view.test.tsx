// @vitest-environment jsdom
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import UsagePage from "../pages/UsagePage";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./bridge", () => native);
vi.mock("../hooks/useAgentChanges", () => ({ useAgentChanges: () => {} }));
afterEach(cleanup);
it("refreshes provider receipts before displaying totals and explains pending charges", async () => {
  let checked = false;
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "sync_generation_charges") { checked = true; return { ok: true, value: { checked: 2, reported: 1, notes: [{ request_id: "pending", message: "FAL billing access denied. This cost remains unconfirmed." }] } }; }
    if (command === "get_generation_usage") return { ok: true, value: { total_count: 2, items: [
      { request_id: "paid", provider_request_id: "job", project_id: "film", provider: "fal", model_id: "flux", kind: "image", status: "completed", started_at: "2026-10-31T10:00:00Z", reported_microusd: checked ? 23000 : null, estimated_min_microusd: 25000, estimated_max_microusd: 25000 },
      { request_id: "pending", provider_request_id: "pending-job", project_id: "film", provider: "fal", model_id: "flux", kind: "image", status: "failed", started_at: "2026-10-31T10:00:00Z", reported_microusd: null, estimated_min_microusd: 25000, estimated_max_microusd: 25000 },
    ] } };
    if (command === "get_generation_cost_summary") return { ok: true, value: { reported_microusd: checked ? 23000 : 0, estimated_min_microusd: 25000, estimated_max_microusd: 25000, unknown_count: 0, total_count: 2 } };
    throw new Error("Unexpected command");
  });
  render(createElement(MemoryRouter, { initialEntries: ["/usage/film"] }, createElement(Routes, null, createElement(Route, { path: "/usage/:id", element: createElement(UsagePage) }))));
  expect(await screen.findByText("$0.023 reported")).toBeTruthy();
  expect(screen.getByText("FAL billing access denied. This cost remains unconfirmed.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Refresh charges" })).toBeTruthy();
});
