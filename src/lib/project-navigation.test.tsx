// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import { updateProject } from "./backend-api";
vi.mock("./bridge", () => ({
  invoke: async () => ({
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
  }),
}));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getProject: async () => ({ id: "film", name: "Morning" }),
  getStoryboardsWithPreview: async () => [
    { id: "opening", project_id: "film", name: "Opening scene" },
  ],
  getApiKeyStatusAction: async () => [],
  updateProject: vi.fn(async (id: string, name: string) => ({ id, name, created_at: "", updated_at: "" })),
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
vi.mock("../pages/StoryboardPage", () => ({
  default: () =>
    createElement(
      "section",
      { "aria-label": "Opening canvas" },
      "Opening scene",
    ),
}));
vi.mock("../pages/ProjectPage", async () => {
  const { useLocation } = await import("react-router");
  return {
    default: () =>
      createElement(
        "section",
        {
          "aria-label": useLocation().search ? "Project bible" : "Storyboards",
        },
        "Project view",
      ),
  };
});
afterEach(cleanup);
it("keeps project views in one navigator that can be opened from any workspace", async () => {
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  const navigator = await screen.findByRole("navigation", {
    name: "Project navigator",
  });
  screen.getByRole("button", { name: "Project navigator" }).focus();
  expect(await screen.findByRole("tooltip", { name: "Project navigator" })).toBeTruthy();
  await user.click(
    await within(navigator).findByRole("link", { name: "Opening scene" }),
  );
  await screen.findByRole("region", { name: "Opening canvas" });
  expect(
    screen.queryByRole("navigation", { name: "Project views" }),
  ).toBeNull();
  expect(
    screen.queryByRole("navigation", { name: "Project navigator" }),
  ).toBeNull();
  const toggle = screen.getByRole("button", { name: "Project navigator" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await user.click(toggle);
  const opened = screen.getByRole("navigation", { name: "Project navigator" });
  await user.click(within(opened).getByRole("link", { name: "Bible" }));
  await screen.findByRole("region", { name: "Project bible" });
  expect(
    screen.getByRole("navigation", { name: "Project navigator" }),
  ).toBeTruthy();
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Project navigator" }),
    ).getByRole("link", { name: "Opening scene" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Project navigator" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  await user.click(screen.getByRole("button", { name: "Project navigator" }));
  expect(
    screen.queryByRole("navigation", { name: "Project navigator" }),
  ).toBeNull();
});

it("keeps project naming in project settings and saves only on an explicit action", async () => {
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  await user.click(await screen.findByRole("button", { name: "Project settings" }));
  const dialog = await screen.findByRole("dialog", { name: "Project settings" });
  const field = within(dialog).getByRole("textbox", { name: "Project name" });
  await user.clear(field);
  await user.type(field, "Evening");
  await user.click(within(dialog).getByText("Project name"));
  expect(updateProject).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(updateProject).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Project settings" }));
  const reopened = screen.getByRole("dialog", { name: "Project settings" });
  const reopenedField = within(reopened).getByRole("textbox", { name: "Project name" });
  expect((reopenedField as HTMLInputElement).value).toBe("Morning");
  await user.clear(reopenedField);
  await user.type(reopenedField, "Evening");
  await user.click(within(reopened).getByRole("button", { name: "Save changes" }));
  expect(updateProject).toHaveBeenCalledWith("film", "Evening");
  expect(screen.queryByRole("dialog", { name: "Project settings" })).toBeNull();
});
it("represents the navigator as one disclosure rather than a second toggle state", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const toggle = await screen.findByRole("button", { name: "Project navigator" });
  expect(toggle.hasAttribute("aria-expanded")).toBe(true);
  expect(toggle.hasAttribute("aria-pressed")).toBe(false);
});
