import { describe, expect, it, vi } from "vitest";
import { hideDefaultApplicationMenu } from "./app-menu";

describe("hideDefaultApplicationMenu", () => {
  it("suppresses Electron's default application menu", () => {
    const setApplicationMenu = vi.fn();

    hideDefaultApplicationMenu({ setApplicationMenu });

    expect(setApplicationMenu).toHaveBeenCalledWith(null);
  });
});

it("offers native project-file commands with desktop accelerators", async () => {
  const { projectApplicationMenu } = await import("./app-menu");
  const send = vi.fn();
  const menu = projectApplicationMenu(send);
  const file = menu.find((item) => item.label === "&File");
  expect(file?.submenu).toMatchObject([
    { label: "New Project…", accelerator: "CmdOrCtrl+N" },
    { label: "Open Project…", accelerator: "CmdOrCtrl+O" },
    { type: "separator" },
    { label: "Save", accelerator: "CmdOrCtrl+S" },
    { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S" },
    { type: "separator" },
    { label: "Close Project", accelerator: "CmdOrCtrl+Shift+W" },
    { type: "separator" },
    { role: "quit" },
  ]);
  if (Array.isArray(file?.submenu) && "click" in file.submenu[1]) file.submenu[1].click?.();
  expect(send).toHaveBeenCalledWith("open");
});
