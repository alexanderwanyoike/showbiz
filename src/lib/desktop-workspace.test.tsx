// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
vi.mock("./bridge", () => ({
  invoke: async () => ({
    ok: true,
    value: {
      current: {
        file_path: "/Films/Morning.showbiz",
        project_id: "p",
        name: "A quiet morning",
      },
      recent: [],
      legacy: [],
    },
  }),
}));
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
it("keeps desktop navigation and status visible while moving from the open document to its bible", async () => {
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  const navigator = await screen.findByRole("navigation", {
    name: "Project navigator",
  });
  expect(screen.queryByText("All projects")).toBeNull();
  expect(
    screen.getByRole("contentinfo", { name: "Application status" }),
  ).toBeTruthy();
  await user.click(
    await within(navigator).findByRole("link", { name: "Bible" }),
  );
  expect(
    await screen.findByRole("region", { name: "Project bible" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("navigation", { name: "Project navigator" }),
  ).toBeTruthy();
});

it("keeps project naming in project settings and lets Escape keep the saved name", async () => {
  const user = userEvent.setup();
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/project/p"] },
      createElement(App),
    ),
  );
  await user.click(
    await screen.findByRole("button", { name: "Project settings" }),
  );
  const input = screen.getByRole("textbox", {
    name: "Project name",

  });
  await user.clear(input);
  await user.type(input, "Uncommitted name");
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("textbox", { name: "Project name" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Project settings" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Project settings" }));
  expect((screen.getByRole("textbox", { name: "Project name" }) as HTMLInputElement).value).toBe("A quiet morning");
});

it("refreshes the project navigator when the application reports a project change", async () => {
  const api = await import("./backend-api");
  const projects = vi.spyOn(api, "getProject");
  projects.mockResolvedValue({
    id: "p",
    name: "A quiet morning",
    updated_at: "2026-10-31",
    created_at: "2026-10-31",
  });
  render(createElement(MemoryRouter, null, createElement(App)));
  await screen.findByRole("navigation", { name: "Project navigator" });
  await screen.findByRole("button", { name: "Project settings" });
  projects.mockResolvedValue({
    id: "p",
    name: "Renamed project",
    updated_at: "2026-10-31",
    created_at: "2026-10-31",
  });
  await act(async () => { window.dispatchEvent(new Event("showbiz:project-changed")); });
  expect(
    await screen.findByText("Renamed project", { exact: true }),
  ).toBeTruthy();
  projects.mockRestore();
});
