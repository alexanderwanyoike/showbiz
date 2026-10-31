// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getProjects: async () => [
    { id: "p", name: "A quiet morning", updated_at: "2026-10-31" },
  ],
  getProject: async () => ({
    id: "p",
    name: "A quiet morning",
    updated_at: "2026-10-31",
  }),
  getStoryboardsWithPreview: async () => [],
  getBibles: async () => [{ id: "b", project_id: "p", name: "Project bible" }],
  getBibleAssets: async () => [],
  getApiKeyStatusAction: async () => [],
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
afterEach(cleanup);
it("keeps desktop navigation and status visible while moving from the project library to its bible", async () => {
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  const navigator = await screen.findByRole("navigation", {
    name: "Project navigator",
  });
  expect(await screen.findByRole("table", { name: "Projects" })).toBeTruthy();
  expect(
    screen.getByRole("contentinfo", { name: "Application status" }),
  ).toBeTruthy();
  await user.click(
    await within(navigator).findByRole("link", {
      name: "A quiet morning",
      exact: true,
    }),
  );
  await user.click(
    await within(navigator).findByRole("link", { name: "Bible", exact: true }),
  );
  expect(
    await screen.findByRole("region", { name: "Project bible" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("navigation", { name: "Project navigator" }),
  ).toBeTruthy();
});

it("renames a project from its desktop toolbar and lets Escape keep the saved name", async () => {
  const user = userEvent.setup();
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/project/p"] },
      createElement(App),
    ),
  );
  await user.click(
    await screen.findByRole("button", { name: "Rename project", exact: true }),
  );
  const input = screen.getByRole("textbox", {
    name: "Project name",
    exact: true,
  });
  await user.clear(input);
  await user.type(input, "Uncommitted name");
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("textbox", { name: "Project name", exact: true }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Rename project", exact: true }),
  ).toBeTruthy();
});

it("refreshes the project navigator when the application reports a project change", async () => {
  const api = await import("./backend-api");
  const projects = vi.spyOn(api, "getProjects");
  projects.mockResolvedValue([{ id: "p", name: "A quiet morning", updated_at: "2026-10-31", created_at: "2026-10-31" }]);
  render(createElement(MemoryRouter, null, createElement(App)));
  const navigator = await screen.findByRole("navigation", { name: "Project navigator" });
  await within(navigator).findByRole("link", { name: "A quiet morning", exact: true });
  projects.mockResolvedValue([{ id: "p", name: "Renamed project", updated_at: "2026-10-31", created_at: "2026-10-31" }]);
  window.dispatchEvent(new Event("showbiz:project-changed"));
  expect(await within(navigator).findByRole("link", { name: "Renamed project", exact: true })).toBeTruthy();
  projects.mockRestore();
});
