// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router";
import Application from "../Application";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { applicationWork } from "./application-work";
vi.mock("../components/GenerationCost", () => ({ GenerationCost: () => null }));
const commands = vi.hoisted(() => ({
  project: vi.fn(),
  boards: vi.fn(),
  create: vi.fn(),
}));
const opening = {
  id: "opening",
  project_id: "film",
  name: "Opening scene",
  image_model: "nano-banana",
  video_model: "seedance-2-fal",
  created_at: "2026-10-31",
  updated_at: "2026-10-31",
  preview_image_path: null,
};
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
  getProject: commands.project,
  getStoryboardsWithPreview: commands.boards,
  createStoryboard: commands.create,
  getApiKeyStatusAction: async () => [],
  getBibles: async () => [{ id: "bible" }],
  getBibleAssets: async () => [],
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
      { "aria-label": "Created storyboard canvas" },
      "Created",
    ),
}));
vi.stubGlobal(
  "matchMedia",
  vi.fn(() => ({
    matches: true,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  })),
);
beforeEach(() => {
  commands.project.mockResolvedValue({ id: "film", name: "Morning" });
  commands.boards.mockResolvedValue([opening]);
  commands.create.mockRejectedValue(new Error("The document is read-only."));
});
afterEach(() => {
  cleanup();
  applicationWork.receive({ active: [], unsaved: [], closing: false });
  vi.resetAllMocks();
});
it("keeps search and New in one context toolbar and offers clear filtered recovery", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  const search = await screen.findByRole("searchbox", {
    name: "Search storyboards",
  });
  const toolbar = screen.getByRole("toolbar", { name: "Storyboards" });
  expect(
    within(toolbar).getByRole("button", { name: "New Storyboard" }),
  ).toBeTruthy();
  expect(
    within(toolbar).getByRole("searchbox", { name: "Search storyboards" }),
  ).toBe(search);
  expect(
    screen.getByRole("region", { name: "Storyboards library" }),
  ).toBeTruthy();
  expect(
    await screen.findByRole("link", { name: "Open storyboard Opening scene" }),
  ).toBeTruthy();
  await user.type(search, "Missing");
  expect(screen.getByText("No matching storyboards")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(
    screen.getByRole("link", { name: "Open storyboard Opening scene" }),
  ).toBeTruthy();
});
it("keeps a failed creation name for retry, prevents duplicate submits and opens the completed storyboard", async () => {
  let reject: ((cause: Error) => void) | undefined;
  commands.create.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const router = createMemoryRouter([
    { path: "*", element: createElement(Application) },
  ]);
  render(createElement(RouterProvider, { router }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "New Storyboard" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "New storyboard" });
  const name = within(dialog).getByRole("textbox", { name: "Storyboard name" });
  await user.type(name, "Second scene{Enter}{Enter}");
  expect(commands.create).toHaveBeenCalledTimes(1);
  expect(name.hasAttribute("disabled")).toBe(true);
  expect(
    within(dialog)
      .getByRole("button", { name: "Cancel" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "New storyboard" })).toBeTruthy();
  reject?.(new Error("The document is read-only."));
  expect(await within(dialog).findByRole("alert")).toHaveProperty(
    "textContent",
    "The document is read-only.",
  );
  expect((name as HTMLInputElement).value).toBe("Second scene");
  let displayedDiscard = false;
  const observer = new MutationObserver((changes) => {
    for (const change of changes)
      for (const node of change.addedNodes) {
        if (
          node instanceof Element &&
          (node.matches('[role="alertdialog"]') ||
            node.querySelector('[role="alertdialog"]'))
        )
          displayedDiscard = true;
      }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  commands.create.mockImplementationOnce(async () => {
    applicationWork.receive({
      active: ["export"],
      unsaved: ["draft"],
      closing: false,
    });
    return { ...opening, id: "second", name: "Second scene" };
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Create storyboard" }),
  );
  expect(
    [...router.state.blockers.values()].some(
      (blocker) => blocker.state === "blocked",
    ),
  ).toBe(false);
  expect(
    screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" }),
  ).toBeNull();
  expect(
    await screen.findByRole("region", { name: "Created storyboard canvas" }),
  ).toBeTruthy();
  observer.disconnect();
  expect(displayedDiscard).toBe(false);
  expect(commands.create).toHaveBeenLastCalledWith("film", "Second scene");
  expect(applicationWork.snapshot().unsaved).not.toContain("draft");
  expect(applicationWork.getStatus().unsaved).toContain("draft");
  expect(applicationWork.getStatus().active).toContain("export");
  expect(
    screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" }),
  ).toBeNull();
  router.dispose();
});
it("cancels a creation draft with Escape and restores focus to New", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  const opener = await screen.findByRole("button", { name: "New Storyboard" });
  await user.click(opener);
  await user.type(
    within(
      await screen.findByRole("dialog", { name: "New storyboard" }),
    ).getByRole("textbox", { name: "Storyboard name" }),
    "Unused",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "New storyboard" })).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(applicationWork.getStatus().unsaved).not.toContain("draft");
});
it("keeps a recoverable library load failure in context with a working retry", async () => {
  commands.boards.mockRejectedValue(new Error("The document is busy."));
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  expect(
    await within(
      await screen.findByRole("region", { name: "Storyboards library" }),
    ).findByRole("alert"),
  ).toHaveProperty("textContent", "The document is busy.");
  expect(screen.getByRole("toolbar", { name: "Storyboards" })).toBeTruthy();
  commands.boards.mockResolvedValue([opening]);
  await user.click(
    screen.getByRole("button", { name: "Retry loading storyboards" }),
  );
  expect(
    await screen.findByRole("link", { name: "Open storyboard Opening scene" }),
  ).toBeTruthy();
});

it("retains the open creation draft while an agent refresh is loading", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "New Storyboard" }),
  );
  const name = within(
    await screen.findByRole("dialog", { name: "New storyboard" }),
  ).getByRole("textbox", { name: "Storyboard name" });
  await user.type(name, "Unfinished scene");
  let finish: ((value: (typeof opening)[]) => void) | undefined;
  const refresh = new Promise<(typeof opening)[]>((resolve) => {
    finish = resolve;
  });
  commands.boards.mockImplementation(() => refresh);
  act(() => {
    window.dispatchEvent(new Event("showbiz:project-changed"));
  });
  expect(screen.getByRole("dialog", { name: "New storyboard" })).toBeTruthy();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Storyboard name",
      }) as HTMLInputElement
    ).value,
  ).toBe("Unfinished scene");
  await act(async () => {
    finish?.([opening]);
  });
});
it("retains the approved Bible draft while project metadata refreshes", async () => {
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "Bible" }));
  await user.type(
    await screen.findByRole("textbox", { name: "Character name" }),
    "Mara",
  );
  let finish: ((value: (typeof opening)[]) => void) | undefined;
  const refresh = new Promise<(typeof opening)[]>((resolve) => {
    finish = resolve;
  });
  commands.boards.mockImplementation(() => refresh);
  act(() => {
    window.dispatchEvent(new Event("showbiz:project-changed"));
  });
  expect(
    (
      screen.getByRole("textbox", {
        name: "Character name",
      }) as HTMLInputElement
    ).value,
  ).toBe("Mara");
  await act(async () => {
    finish?.([opening]);
  });
});
it("does not reopen a discarded creation after its native save finishes", async () => {
  let finish: ((value: typeof opening) => void) | undefined;
  commands.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const router = createMemoryRouter([{ path: "*", element: createElement(Application) }]);
  render(createElement(RouterProvider, { router }));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New Storyboard" }));
  await user.type(screen.getByRole("textbox", { name: "Storyboard name" }), "Late board{Enter}");
  await act(async () => { await router.navigate("/project/film?view=bible"); });
  await user.click(within(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).getByRole("button", { name: "Discard and continue" }));
  await screen.findByRole("textbox", { name: "Character name" });
  await act(async () => { finish?.({ ...opening, id: "late", name: "Late board" }); });
  expect(router.state.location.search).toBe("?view=bible");
  await user.click(screen.getByRole("link", { name: "Storyboards" }));
  expect(router.state.location.pathname).toBe("/project/film");
  expect(screen.queryByRole("region", { name: "Created storyboard canvas" })).toBeNull();
  router.dispose();
});
