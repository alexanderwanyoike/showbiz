// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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
vi.mock("./update-client", () => ({ updateClient: { getStatus: async () => ({ state: "current", installed_version: "1.0.3" }), subscribe: () => () => {} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("starts with New and Open, then works inside one file and returns to the start window on Close", async () => {
  let current: { file_path: string; project_id: string; name: string } | null = null;
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "get_projects") return [];
    if (command === "get_project_document_state") return { ok: true, value: { current, recent: [], legacy: [] } };
    if (command === "create_project_document") current = { file_path: "/Films/Morning.showbiz", project_id: "film", name: "Morning" };
    if (command === "close_project_document") current = null;
    return { ok: true, value: current };
  });
  render(createElement(MemoryRouter, null, createElement(App)));
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New Project", exact: true }));
  expect(await screen.findByRole("navigation", { name: "Project navigator" })).toBeTruthy();
  expect(screen.queryByText("All projects")).toBeNull();
  expect(await screen.findByText("/Films/Morning.showbiz")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "File", exact: true }));
  await user.click(await screen.findByRole("menuitem", { name: /Close Project/ }));
  expect(await screen.findByRole("button", { name: "Open Project", exact: true })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Project navigator" })).toBeNull();
});

it("opens recent files by their saved path and keeps the current project when a dialog is cancelled", async () => {
  const file = { file_path: "/Films/Morning.showbiz", project_id: "film", name: "Morning" };
  let current: typeof file | null = null;
  native.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === "get_projects") return [];
    if (command === "get_project_document_state") return { ok: true, value: { current, recent: [file], legacy: [] } };
    if (command === "open_project_document" && args?.file_path) { current = file; return { ok: true, value: file }; }
    return { ok: true, value: null };
  });
  const user = userEvent.setup();
  render(createElement(MemoryRouter, null, createElement(App)));
  await user.click(await screen.findByRole("button", { name: /Open Morning/ }));
  await screen.findByRole("navigation", { name: "Project navigator" });
  expect(native.invoke).toHaveBeenCalledWith("open_project_document", { file_path: file.file_path });
  await user.click(screen.getByRole("button", { name: "File", exact: true }));
  await user.click(await screen.findByRole("menuitem", { name: /Open Project/ }));
  await waitFor(() => expect(native.invoke).toHaveBeenCalledWith("open_project_document", undefined));
  expect(screen.getByRole("navigation", { name: "Project navigator" })).toBeTruthy();
});
