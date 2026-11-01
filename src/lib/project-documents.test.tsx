// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./bridge", () => ({ invoke: native.invoke }));
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
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("starts with New and Open, then works inside one file and returns to the start window on Close", async () => {
  let current: { file_path: string; project_id: string; name: string } | null =
    null;
  native.invoke.mockImplementation(async (command: string) => {
    if (["ensure_default_tracks", "get_timeline_clips"].includes(command))
      return [];
    if (command === "get_projects") return [];
    if (command === "get_project_document_state")
      return { ok: true, value: { current, recent: [], legacy: [] } };
    if (command === "create_project_document")
      current = {
        file_path: "/Films/Morning.showbiz",
        project_id: "film",
        name: "Morning",
      };
    if (command === "close_project_document") current = null;
    return { ok: true, value: current };
  });
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "New Project" }),
  );
  expect(
    await screen.findByRole("navigation", { name: "Project navigator" }),
  ).toBeTruthy();
  expect(screen.queryByText("All projects")).toBeNull();
  expect(await screen.findByText("/Films/Morning.showbiz")).toBeTruthy();
  await user.click(screen.getByRole("menuitem", { name: "File" }));
  await user.click(
    await screen.findByRole("menuitem", { name: /Close Project/ }),
  );
  expect(
    await screen.findByRole("button", { name: "Open Project" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("navigation", { name: "Project navigator" }),
  ).toBeNull();
});

it("opens recent files by their saved path and keeps the current project when a dialog is cancelled", async () => {
  const file = {
    file_path: "/Films/Morning.showbiz",
    project_id: "film",
    name: "Morning",
  };
  let current: typeof file | null = null;
  native.invoke.mockImplementation(
    async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_projects") return [];
      if (command === "get_project_document_state")
        return { ok: true, value: { current, recent: [file], legacy: [] } };
      if (command === "open_project_document" && args?.file_path) {
        current = file;
        return { ok: true, value: file };
      }
      return { ok: true, value: null };
    },
  );
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  await user.click(await screen.findByRole("button", { name: /Open Morning/ }));
  await screen.findByRole("navigation", { name: "Project navigator" });
  expect(native.invoke).toHaveBeenCalledWith("open_project_document", {
    file_path: file.file_path,
  });
  await user.click(screen.getByRole("menuitem", { name: "File" }));
  await user.click(
    await screen.findByRole("menuitem", { name: /Open Project/ }),
  );
  await waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith(
      "open_project_document",
      undefined,
    ),
  );
  expect(
    screen.getByRole("navigation", { name: "Project navigator" }),
  ).toBeTruthy();
});

it("keeps New and Open available while reporting a damaged recent-file list", async () => {
  native.invoke.mockResolvedValue({
    ok: true,
    value: {
      current: null,
      recent: [],
      legacy: [],
      warning: "The recent project list could not be read.",
    },
  });
  render(createElement(MemoryRouter, null, createElement(App)));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("recent project list"),
  );
  expect(
    screen
      .getByRole("button", { name: "Open Project" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

it.each(["project", "storyboard"] as const)(
  "ignores a previous file's delayed %s read after opening another document",
  async (page) => {
    const api = await import("./backend-api");
    let current = {
      file_path: "/Films/Previous.showbiz",
      project_id: "previous",
      name: "Previous",
    };
    let completePrevious!: (value: null) => void;
    const previousRead = new Promise<null>((resolve) => {
      completePrevious = resolve;
    });
    const projectRead = vi
      .spyOn(api, "getProject")
      .mockImplementation(async (id) =>
        id === "previous"
          ? previousRead
          : {
              id: "film",
              name: "Morning",
              created_at: "2026-10-31",
              updated_at: "2026-10-31",
            },
      );
    const storyboardRead = vi
      .spyOn(api, "getStoryboard")
      .mockImplementation(async () => previousRead);
    const shots = vi.spyOn(api, "getShots").mockResolvedValue([]);
    native.invoke.mockImplementation(async (command: string) => {
      if (["ensure_default_tracks", "get_timeline_clips"].includes(command))
        return [];
      if (command === "get_project_document_state")
        return { ok: true, value: { current, recent: [], legacy: [] } };
      current = {
        file_path: "/Films/Morning.showbiz",
        project_id: "film",
        name: "Morning",
      };
      return { ok: true, value: current };
    });
    function Location() {
      return createElement(
        "output",
        { "aria-label": "Current document route" },
        useLocation().pathname,
      );
    }
    try {
      render(
        createElement(
          MemoryRouter,
          { initialEntries: [`/${page}/previous`] },
          createElement(App),
          createElement(Location),
        ),
      );
      await screen.findByRole("navigation", { name: "Project navigator" });
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("menuitem", { name: "File" }),
      );
      await user.click(
        await screen.findByRole("menuitem", { name: /Open Project/ }),
      );
      await screen.findByRole("button", {
        name: "New Storyboard",
      });
      await act(async () => {
        completePrevious(null);
      });
      expect(screen.getByLabelText("Current document route").textContent).toBe(
        "/project/film",
      );
    } finally {
      projectRead.mockRestore();
      storyboardRead.mockRestore();
      shots.mockRestore();
    }
  },
);
