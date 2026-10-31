// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
const receipt = {
  request_id: "paid",
  project_id: "film",
  kind: "video",
  provider: "openrouter",
  model_id: "veo",
  status: "completed",
  settings: { duration: 8, resolution: "720p" },
  estimated_min_microusd: 1200000,
  estimated_max_microusd: 1200000,
  reported_microusd: 1340000,
  started_at: "2026-10-31T12:00:00Z",
  finished_at: "2026-10-31T12:01:00Z",
  price_source: "https://openrouter.ai",
  price_checked_at: "2026-10-31T12:00:00Z",
};
vi.mock("./bridge", () => ({
  invoke: async (command: string) => {
    if (command === "get_generation_usage")
      return {
        ok: true,
        value: {
          items: [
            receipt,
            {
              ...receipt,
              request_id: "unknown",
              reported_microusd: null,
              estimated_min_microusd: null,
              estimated_max_microusd: null,
              status: "interrupted",
            },
          ],
          total_count: 2,
        },
      };
    if (command === "get_generation_cost_summary")
      return {
        ok: true,
        value: {
          reported_microusd: 1340000,
          estimated_min_microusd: 0,
          estimated_max_microusd: 0,
          unknown_count: 1,
          total_count: 2,
        },
      };
    return {
      ok: true,
      value: {
        current: {
          file_path: "/Films/Morning.showbiz",
          project_id: "film",
          name: "Morning",
        },
        recent: [],
        legacy: [],
      },
    };
  },
}));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getProject: async () => ({ id: "film", name: "Morning" }),
  getStoryboardsWithPreview: async () => [],
  getApiKeyStatusAction: async () => [],
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
vi.mock("../pages/ProjectPage", () => ({
  default: () => createElement("section", null, "Storyboards"),
}));
afterEach(cleanup);
it("opens usage from the project navigator and distinguishes reported charges from unknown outcomes", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("link", { name: "Usage & billing" }),
  );
  const page = await screen.findByRole("region", { name: "Usage & billing" });
  expect(await within(page).findByText("$1.34")).toBeTruthy();
  expect(within(page).getByText("Reported charges")).toBeTruthy();
  expect(within(page).getByText("1 unknown charge")).toBeTruthy();
  expect(within(page).getByText("interrupted")).toBeTruthy();
  expect(within(page).getByText("Unknown")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Usage & billing" })
      .getAttribute("aria-current"),
  ).toBe("page");
});
