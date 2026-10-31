// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
vi.mock("./backend-api", async (original) => ({
  ...await original<typeof import("./backend-api")>(),
  getProjects: async () => [{ id: "p", name: "A quiet morning", updated_at: "2026-10-31" }],
  getProject: async () => ({ id: "p", name: "A quiet morning", updated_at: "2026-10-31" }),
  getStoryboardsWithPreview: async () => [],
  getBibles: async () => [],
  getApiKeyStatusAction: async () => [],
}));
vi.mock("./update-client", () => ({ updateClient: { getStatus: async () => ({ state: "current", installed_version: "1.0.3" }), subscribe: () => () => {} } }));
afterEach(cleanup);
it("keeps desktop navigation and status visible while moving from the project library to its bible", async () => {
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  const navigator = await screen.findByRole("navigation", { name: "Project navigator" });
  expect(await screen.findByRole("table", { name: "Projects" })).toBeTruthy();
  expect(screen.getByRole("contentinfo", { name: "Application status" })).toBeTruthy();
  await user.click(await within(navigator).findByRole("link", { name: "A quiet morning", exact: true }));
  await user.click(await within(navigator).findByRole("link", { name: "Bible", exact: true }));
  expect(await screen.findByRole("region", { name: "Project bible" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Project navigator" })).toBeTruthy();
});
