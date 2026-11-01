import type { DesktopMenuCommand, DesktopPlatform } from "./desktop-shell";
export type DocumentMenuAction = "new" | "open" | "save" | "save_as" | "close";
export type MenuShortcut = DesktopMenuCommand | DocumentMenuAction;
const accelerators: Record<
  Exclude<MenuShortcut, "redo" | "toggle_fullscreen" | "quit">,
  string
> = {
  new: "CmdOrCtrl+N",
  open: "CmdOrCtrl+O",
  save: "CmdOrCtrl+S",
  save_as: "CmdOrCtrl+Shift+S",
  close: "CmdOrCtrl+Shift+W",
  undo: "CmdOrCtrl+Z",
  cut: "CmdOrCtrl+X",
  copy: "CmdOrCtrl+C",
  paste: "CmdOrCtrl+V",
  select_all: "CmdOrCtrl+A",
  zoom_in: "CmdOrCtrl+Plus",
  zoom_out: "CmdOrCtrl+-",
  zoom_reset: "CmdOrCtrl+0",
};
export function menuAccelerator(
  command: MenuShortcut,
  platform: DesktopPlatform,
): string | undefined {
  if (command === "redo")
    return platform === "win32" ? "Control+Y" : "CmdOrCtrl+Shift+Z";
  if (command === "toggle_fullscreen")
    return platform === "darwin" ? "Control+Command+F" : "F11";
  if (command === "quit")
    return platform === "win32" ? undefined : "CmdOrCtrl+Q";
  return accelerators[command];
}
export function menuShortcutLabel(
  command: MenuShortcut,
  platform: DesktopPlatform,
): string {
  const accelerator = menuAccelerator(command, platform);
  if (!accelerator) return "";
  if (platform === "darwin")
    return accelerator
      .replace("Control+", "⌃")
      .replace("CmdOrCtrl+", "⌘")
      .replace("Command+", "⌘")
      .replace("Shift+", "⇧")
      .replace("⌘⇧", "⇧⌘")
      .replace("Plus", "+");
  return accelerator
    .replace("CmdOrCtrl", "Ctrl")
    .replace("Control", "Ctrl")
    .replace("Plus", "+");
}
