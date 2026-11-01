// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import UsagePage from "../pages/UsagePage";
import type { GenerationUsage } from "../../shared/generation-usage";
import type { UsageWithBilling } from "./generation-billing";

const billing = vi.hoisted(() => ({
  loadUsageWithBilling: vi.fn(),
  refreshUsageCharges: async () => null,
}));
vi.mock("./generation-billing", () => billing);
vi.mock("../hooks/useAgentChanges", () => ({ useAgentChanges: () => {} }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const request: GenerationUsage = {
  request_id: "reported-zero",
  project_id: "film",
  subject_id: "shot1",
  kind: "image_edit",
  provider: "fal",
  model_id: "flux-dev-fal",
  status: "completed",
  settings: {},
  price_basis: null,
  estimated_min_microusd: 25000,
  estimated_max_microusd: 25000,
  reported_microusd: 0,
  provider_request_id: "provider-job-zero",
  started_at: "2026-10-31T12:00:00Z",
  finished_at: "2026-10-31T12:01:00Z",
  price_source: "https://fal.ai/pricing",
  price_checked_at: "2026-10-31T11:00:00Z",
};
function page(items: GenerationUsage[] = [request]): UsageWithBilling {
  return {
    items,
    total_count: items.length,
    billing_notes: [],
    summary: {
      reported_microusd: 0,
      estimated_min_microusd: 0,
      estimated_max_microusd: 0,
      unknown_count: 0,
      total_count: items.length,
    },
  };
}
function renderUsage() {
  return render(
    <MemoryRouter initialEntries={["/usage/film"]}>
      <Link to="/usage/other">Other project</Link>
      <Routes>
        <Route path="/usage/:id" element={<UsagePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("keeps human request rows compact and exposes exact receipt identity in request details", async () => {
  billing.loadUsageWithBilling.mockResolvedValue({ ok: true, value: page() });
  renderUsage();
  const model = await screen.findByRole("cell", { name: "Flux Dev" });
  const row = model.closest("tr");
  expect(row).not.toBeNull();
  expect(within(row!).getByRole("cell", { name: "fal.ai" })).toBeTruthy();
  expect(within(row!).getByRole("cell", { name: "Image edit" })).toBeTruthy();
  expect(within(row!).getByRole("cell", { name: "Completed" })).toBeTruthy();
  expect(within(row!).getByText("$0.00 reported")).toBeTruthy();
  expect(screen.queryByText("provider-job-zero")).toBeNull();
  const user = userEvent.setup();
  within(row!).getByRole("button", { name: "View request details" }).focus();
  await user.keyboard("{Enter}");
  const details = await screen.findByRole("dialog", {
    name: "Request details",
  });
  expect(within(details).getByText("provider-job-zero")).toBeTruthy();
  expect(within(details).getByText("flux-dev-fal")).toBeTruthy();
  expect(within(details).getByText("reported-zero")).toBeTruthy();
  expect(within(details).getByText("~$0.025")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    within(row!).getByRole("button", { name: "View request details" }),
  );
});

it("refreshes the current page and resets pagination before opening another project", async () => {
  const initial = page(
    Array.from({ length: 50 }, (_, index) => ({
      ...request,
      request_id: `request-${index}`,
    })),
  );
  initial.total_count = 51;
  const last = {
    ...page([{ ...request, request_id: "last-request" }]),
    total_count: 51,
  };
  billing.loadUsageWithBilling.mockImplementation(
    async (projectId: string, offset: number) => ({
      ok: true,
      value: projectId === "other" ? page([]) : offset === 50 ? last : initial,
    }),
  );
  renderUsage();
  const user = userEvent.setup();
  await screen.findByText("1 to 50 of 51 requests");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("51 to 51 of 51 requests");
  expect(billing.loadUsageWithBilling).toHaveBeenLastCalledWith("film", 50);
  await user.click(screen.getByRole("button", { name: "Refresh charges" }));
  await screen.findByText("51 to 51 of 51 requests");
  expect(billing.loadUsageWithBilling).toHaveBeenLastCalledWith("film", 50);
  await user.click(screen.getByRole("link", { name: "Other project" }));
  await screen.findByText("No generations recorded yet.");
  expect(billing.loadUsageWithBilling).toHaveBeenLastCalledWith("other", 0);
  expect(
    screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("distinguishes a reported zero from an unconfirmed zero estimate and an unknown failed charge", async () => {
  const unknown = {
    ...request,
    request_id: "unknown",
    provider_request_id: "pending-job",
    reported_microusd: null,
    estimated_min_microusd: null,
    estimated_max_microusd: null,
    status: "failed" as const,
  };
  const value = page([
    request,
    {
      ...request,
      request_id: "estimate-zero",
      reported_microusd: null,
      estimated_min_microusd: 0,
      estimated_max_microusd: 0,
      status: "interrupted",
    },
    unknown,
  ]);
  value.summary.unknown_count = 1;
  value.billing_notes = [
    { request_id: "unknown", message: "Provider receipt is pending." },
  ];
  billing.loadUsageWithBilling.mockResolvedValue({ ok: true, value });
  renderUsage();
  await screen.findByText("$0.00 reported");
  expect(screen.getByText("~$0.00 estimated")).toBeTruthy();
  const unknownCell = screen.getByRole("cell", {
    name: "Unknown Charge unconfirmed",
  });
  expect(unknownCell.textContent).not.toContain("$0");
  expect(screen.getByText("1 unknown charge")).toBeTruthy();
  const user = userEvent.setup();
  await user.click(
    within(unknownCell.closest("tr")!).getByRole("button", {
      name: "View request details",
    }),
  );
  expect(
    within(screen.getByRole("dialog", { name: "Request details" })).getByText(
      "Provider receipt is pending.",
    ),
  ).toBeTruthy();
});

it("shows a recoverable ledger error without invented totals, then reloads on retry", async () => {
  billing.loadUsageWithBilling
    .mockResolvedValueOnce({
      ok: false,
      error: { code: "IO_ERROR", message: "Recorded usage could not be read." },
    })
    .mockResolvedValueOnce({ ok: true, value: page([]) });
  renderUsage();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Recorded usage could not be read.",
  );
  expect(screen.queryByLabelText("Project cost totals")).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Retry usage" }));
  await screen.findByText("No generations recorded yet.");
  expect(screen.getByText("0 requests")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("explains that unconfirmed estimates include unsuccessful requests without claiming a bill", async () => {
  const value = page([
    { ...request, status: "failed", reported_microusd: null },
  ]);
  value.summary.estimated_min_microusd = 25000;
  value.summary.estimated_max_microusd = 25000;
  billing.loadUsageWithBilling.mockResolvedValue({ ok: true, value });
  renderUsage();
  await screen.findByRole("cell", { name: "Failed" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "How costs are recorded" }));
  const help = screen.getByRole("dialog", { name: "How costs are recorded" });
  expect(
    within(help).getByText(/failed, cancelled or interrupted requests/i),
  ).toBeTruthy();
  expect(
    within(help).getByText(/a failed request may still incur a charge/i),
  ).toBeTruthy();
});
