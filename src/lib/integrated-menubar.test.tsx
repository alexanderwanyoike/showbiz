// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import type { Result } from "../../shared/result";
import { menuShortcut } from "./menu-editor";
const nativeCommand = vi.hoisted(() =>
  vi.fn<(_command: string) => Promise<Result<null>>>(async () => ({
    ok: true,
    value: null,
  })),
);
vi.mock("./bridge", () => ({
  invoke: async () => ({
    ok: true,
    value: { current: null, recent: [], legacy: [] },
  }),
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
vi.mock("../components/SettingsDialog", () => ({
  SettingsDialog: ({
    open,
    initialSection,
  }: {
    open: boolean;
    initialSection: string;
  }) =>
    open
      ? createElement(
          "section",
          { role: "dialog", "aria-label": "Settings" },
          initialSection,
        )
      : null,
}));
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "showbiz", {
    value: undefined,
    configurable: true,
  });
  nativeCommand.mockClear();
});
function start() {
  render(createElement(MemoryRouter, null, createElement(App)));
}
it("keeps File Edit View Help visible in the app titlebar even when native document shortcuts exist", async () => {
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "linux", customTitlebar: true, titleBarHeight: 48 },
      onDocumentAction: () => () => {},
      runMenuCommand: nativeCommand,
    },
  });
  start();
  const menus = await screen.findByRole("menubar", {
    name: "Application menu",
  });
  for (const name of ["File", "Edit", "View", "Help"])
    expect(within(menus).getByRole("menuitem", { name })).toBeTruthy();
  const file = within(menus).getByRole("menuitem", { name: "File" });
  file.focus();
  await userEvent.setup().keyboard("{ArrowDown}");
  expect(
    await screen.findByRole("menuitem", { name: "New Project…" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("menuitem", { name: "Save" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  await userEvent.setup().keyboard("{Escape}");
  expect(document.activeElement).toBe(file);
});
it("restores the editable selection before dispatching a native Cut command", async () => {
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "linux", customTitlebar: true, titleBarHeight: 48 },
      runMenuCommand: nativeCommand,
    },
  });
  render(
    createElement(
      MemoryRouter,
      null,
      createElement("input", {
        "aria-label": "Prompt",
        defaultValue: "Morning",
      }),
      createElement(App),
    ),
  );
  const user = userEvent.setup();
  const prompt = screen.getByRole("textbox", {
    name: "Prompt",
  }) as HTMLInputElement;
  prompt.focus();
  prompt.setSelectionRange(1, 4);
  let focus: Element | null = null;
  let start: number | null = null;
  let end: number | null = null;
  nativeCommand.mockImplementationOnce(async () => {
    focus = document.activeElement;
    start = prompt.selectionStart;
    end = prompt.selectionEnd;
    return { ok: true, value: null };
  });
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  await user.click(screen.getByRole("menuitem", { name: "Cut" }));
  await waitFor(() => expect(nativeCommand).toHaveBeenCalledWith("cut"));
  expect(focus).toBe(prompt);
  expect(start).toBe(1);
  expect(end).toBe(4);
  const edit = screen.getByRole("menuitem", { name: "Edit" });
  await user.click(edit);
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(edit);
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(prompt);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("focuses the menu with F10 and opens real Appearance and Updates destinations", async () => {
  start();
  const user = userEvent.setup();
  await user.keyboard("{F10}");
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: "File" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(screen.getByRole("menuitem", { name: "Appearance…" }));
  expect(
    await screen.findByRole("dialog", { name: "Settings" }),
  ).toHaveProperty("textContent", "appearance");
  await user.click(screen.getByRole("menuitem", { name: "Help" }));
  await user.click(
    screen.getByRole("menuitem", { name: "Check for Updates…" }),
  );
  expect(screen.getByRole("dialog", { name: "Settings" })).toHaveProperty(
    "textContent",
    "updates",
  );
});

it("reports native command failures and lets the user dismiss and retry", async () => {
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "win32", customTitlebar: true, titleBarHeight: 48 },
      runMenuCommand: nativeCommand,
    },
  });
  nativeCommand.mockResolvedValueOnce({
    ok: false,
    error: { code: "IO_ERROR", message: "The window could not be resized." },
  });
  start();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("menuitem", { name: "View" }));
  await user.click(screen.getByRole("menuitem", { name: "Zoom In" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The window could not be resized.Dismiss",
  );
  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(screen.getByRole("menuitem", { name: "Zoom In" }));
  await waitFor(() => expect(nativeCommand).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).toBeNull();
});
it("uses platform-correct document shortcut labels", () => {
  expect(menuShortcut("N", true)).toBe("⌘N");
  expect(menuShortcut("Shift+S", true)).toBe("⇧⌘S");
  expect(menuShortcut("Shift+W", false)).toBe("Ctrl+Shift+W");
});

it("opens a real keyboard reference from Help and returns focus on Escape", async () => {
  start();
  const user = userEvent.setup();
  const help = await screen.findByRole("menuitem", { name: "Help" });
  await user.click(help);
  await user.click(
    screen.getByRole("menuitem", { name: "Keyboard Shortcuts…" }),
  );
  const reference = await screen.findByRole("dialog", {
    name: "Keyboard shortcuts",
  });
  expect(within(reference).getByText("New project")).toBeTruthy();
  expect(within(reference).getByText("Focus application menu")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeNull();
  expect(document.activeElement).toBe(help);
});

it("does not advertise an unregistered Windows Quit accelerator", async () => {
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "win32", customTitlebar: true, titleBarHeight: 48 },
      runMenuCommand: nativeCommand,
    },
  });
  start();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("menuitem", { name: "File" }));
  expect(
    screen.getByRole("menuitem", { name: "Quit Showbiz" }).textContent,
  ).toBe("Quit Showbiz");
});
