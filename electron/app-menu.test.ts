import { expect, it, vi } from "vitest";

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
  if (Array.isArray(file?.submenu) && "click" in file.submenu[1])
    file.submenu[1].click?.();
  expect(send).toHaveBeenCalledWith("open");
});
it("keeps native View accelerators aligned with the integrated zoom and fullscreen menu", async () => {
  const { projectApplicationMenu } = await import("./app-menu");
  const menu = projectApplicationMenu(vi.fn());
  expect(menu.find((item) => item.label === "&View")?.submenu).toEqual([
    { role: "resetZoom", accelerator: "CmdOrCtrl+0" },
    { role: "zoomIn", accelerator: "CmdOrCtrl+Plus" },
    { role: "zoomOut", accelerator: "CmdOrCtrl+-" },
    { type: "separator" },
    { role: "togglefullscreen", accelerator: "F11" },
  ]);
  expect(menu).not.toContainEqual({ role: "viewMenu" });
});
it("provides native macOS settings and Help routes with shared platform accelerators", async () => {
  const { projectApplicationMenu } = await import("./app-menu");
  const sendApplicationAction = vi.fn();
  const menu = projectApplicationMenu(vi.fn(), {
    platform: "darwin",
    sendApplicationAction,
  });
  expect(menu[0]).toMatchObject({ role: "appMenu" });
  const help = menu.find((item) => item.label === "Help");
  expect(help?.submenu).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Keyboard Shortcuts…" }),
    ]),
  );
  if (Array.isArray(help?.submenu)) {
    const shortcuts = help.submenu.find(
      (item) => "label" in item && item.label === "Keyboard Shortcuts…",
    );
    if (shortcuts && "click" in shortcuts) shortcuts.click?.();
  }
  expect(sendApplicationAction).toHaveBeenCalledWith("shortcuts");
});
it("sets explicit redo and zoom accelerators from the shared shortcut definitions", async () => {
  const { projectApplicationMenu } = await import("./app-menu");
  const menu = projectApplicationMenu(vi.fn(), {
    platform: "win32",
    sendApplicationAction: vi.fn(),
  });
  expect(menu.find((item) => item.label === "&Edit")?.submenu).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: "redo", accelerator: "Control+Y" }),
    ]),
  );
});
