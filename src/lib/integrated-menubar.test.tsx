// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
const nativeCommand = vi.hoisted(() => vi.fn(async (_command: string) => ({ ok: true, value: null })));
vi.mock("./bridge", () => ({ invoke: async () => ({ ok: true, value: { current: null, recent: [], legacy: [] } }) }));
vi.mock("./update-client", () => ({ updateClient: { getStatus: async () => ({ state: "current", installed_version: "1.0.3" }), subscribe: () => () => {} } }));
vi.mock("../components/SettingsDialog", () => ({ SettingsDialog: ({ open, initialSection }: { open: boolean; initialSection: string }) => open ? createElement("section", { role: "dialog", "aria-label": "Settings" }, initialSection) : null }));
afterEach(() => { cleanup(); Object.defineProperty(window, "showbiz", { value: undefined, configurable: true }); nativeCommand.mockClear(); });
function start() { render(createElement(MemoryRouter, null, createElement(App))); }
it("keeps File Edit View Help visible in the app titlebar even when native document shortcuts exist", async () => {
  Object.defineProperty(window, "showbiz", { configurable: true, value: { desktop: { platform: "linux", customTitlebar: true, titleBarHeight: 48 }, onDocumentAction: () => () => {}, runMenuCommand: nativeCommand } });
  start();
  const menus = await screen.findByRole("menubar", { name: "Application menu" });
  for (const name of ["File", "Edit", "View", "Help"]) expect(within(menus).getByRole("menuitem", { name })).toBeTruthy();
  const file = within(menus).getByRole("menuitem", { name: "File" });
  file.focus();
  await userEvent.setup().keyboard("{ArrowDown}");
  expect(await screen.findByRole("menuitem", { name: "New Project…" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  await userEvent.setup().keyboard("{Escape}");
  expect(document.activeElement).toBe(file);
});
it("restores the editable selection before dispatching a native Cut command", async () => {
  Object.defineProperty(window, "showbiz", { configurable: true, value: { desktop: { platform: "linux", customTitlebar: true, titleBarHeight: 48 }, runMenuCommand: nativeCommand } });
  render(createElement(MemoryRouter, null, createElement("input", { "aria-label": "Prompt", defaultValue: "Morning" }), createElement(App)));
  const user = userEvent.setup();
  const prompt = screen.getByRole("textbox", { name: "Prompt" }) as HTMLInputElement;
  prompt.focus(); prompt.setSelectionRange(1, 4);
  nativeCommand.mockImplementationOnce(async () => { expect(document.activeElement).toBe(prompt); expect(prompt.selectionStart).toBe(1); expect(prompt.selectionEnd).toBe(4); return { ok: true, value: null }; });
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  await user.click(screen.getByRole("menuitem", { name: "Cut" }));
  expect(nativeCommand).toHaveBeenCalledWith("cut");
});
it("focuses the menu with F10 and opens real Appearance and Updates destinations", async () => {
  start(); const user = userEvent.setup();
  await user.keyboard("{F10}");
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "File" }));
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(screen.getByRole("menuitem", { name: "Appearance…" }));
  expect(await screen.findByRole("dialog", { name: "Settings" })).toHaveProperty("textContent", "appearance");
});
