// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import Application from "../Application";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
vi.mock("./bridge", () => ({ invoke: async () => ({ ok: true, value: { current: { file_path: "/Films/Morning.showbiz", project_id: "film", name: "Morning" }, recent: [], legacy: [] } }) }));
vi.mock("./backend-api", async (original) => ({
  ...(await original<typeof import("./backend-api")>()),
  getProject: async () => ({ id: "film", name: "Morning" }),
  getStoryboardsWithPreview: async () => [{ id: "opening", project_id: "film", name: "Opening scene" }],
  getApiKeyStatusAction: async () => [],
  getBibles: async () => [{ id: "bible" }], getBibleAssets: async () => [],
}));
vi.mock("../pages/StoryboardPage", () => ({ default: () => createElement("section", { "aria-label": "Opening canvas" }, "Opening") }));
vi.mock("./update-client", () => ({ updateClient: { getStatus: async () => ({ state: "current", installed_version: "1.0.3" }), subscribe: () => () => {} } }));
vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })));
afterEach(cleanup);
it("keeps a dirty workspace mounted until Stay or Discard is chosen for an internal link", async () => {
  const router = createMemoryRouter([{ path: "*", element: createElement(Application) }]);
  render(createElement(RouterProvider, { router }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "Bible" }));
  await user.type(await screen.findByRole("textbox", { name: "Character name" }), "Ada");
  await user.click(screen.getByRole("link", { name: "Opening scene" }));
  const prompt = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
  await user.click(within(prompt).getByRole("button", { name: "Stay" }));
  expect((screen.getByRole("textbox", { name: "Character name" }) as HTMLInputElement).value).toBe("Ada");
  expect(screen.queryByRole("region", { name: "Opening canvas" })).toBeNull();
  await user.click(screen.getByRole("link", { name: "Opening scene" }));
  await user.click(within(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).getByRole("button", { name: "Discard and continue" }));
  expect(await screen.findByRole("region", { name: "Opening canvas" })).toBeTruthy();
  expect(screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeNull();
  router.dispose();
});
it("discards drafts held by a persistent project view without leaving navigation blocked", async () => {
  const router = createMemoryRouter([{ path: "*", element: createElement(Application) }]);
  render(createElement(RouterProvider, { router }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New Storyboard" }));
  await user.type(screen.getByPlaceholderText("Storyboard name..."), "Unfinished board");
  await user.click(screen.getByRole("link", { name: "Bible" }));
  await user.click(within(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).getByRole("button", { name: "Discard and continue" }));
  await screen.findByRole("textbox", { name: "Character name" });
  await user.click(screen.getByRole("link", { name: "Storyboards" }));
  expect(screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeNull();
  expect(await screen.findByRole("button", { name: "New Storyboard" })).toBeTruthy();
  router.dispose();
});
