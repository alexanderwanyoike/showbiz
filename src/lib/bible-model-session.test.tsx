// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
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
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [],
}));
vi.mock("../pages/StoryboardPage", () => ({
  default: () =>
    createElement("section", { "aria-label": "Opening canvas" }, "Opening"),
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
afterEach(cleanup);
it("remembers the Bible generation model while moving between workspaces in the same open project", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "Bible" }));
  await user.click(
    await screen.findByRole("combobox", { name: "Bible generation model" }),
  );
  await user.click(
    screen.getByRole("option", { name: /Local image.*LocalAI/ }),
  );
  await user.click(screen.getByRole("link", { name: "Opening scene" }));
  await screen.findByRole("region", { name: "Opening canvas" });
  await user.click(screen.getByRole("button", { name: "Project navigator" }));
  await user.click(screen.getByRole("link", { name: "Bible" }));
  expect(
    (await screen.findByRole("combobox", { name: "Bible generation model" }))
      .textContent,
  ).toContain("Local image");
});

it("keeps Bible orientation accessible without adding a second visible view header above its controls", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "Bible" }));
  await screen.findByRole("region", { name: "Project bible" });
  expect(screen.queryByText("Project bible", { selector: "header *" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Project bible", level: 1 })).toBeTruthy();
  expect(screen.getByRole("tablist", { name: "Bible sections" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "New character" })).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Storyboards" }));
  expect(await screen.findByText("Storyboards", { selector: "header *" })).toBeTruthy();
});
