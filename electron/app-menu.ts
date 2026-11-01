import type { MenuItemConstructorOptions } from "electron";
import type {
  ApplicationMenuAction,
  DesktopPlatform,
  DesktopMenuCommand,
} from "../shared/desktop-shell";
import {
  menuAccelerator,
  type DocumentMenuAction,
} from "../shared/menu-shortcuts";
interface ApplicationMenuItem {
  label?: string;
  role?: MenuItemConstructorOptions["role"];
  type?: "separator";
  accelerator?: string;
  click?: () => void;
  submenu?: ApplicationMenuItem[];
}
export function projectApplicationMenu(
  send: (action: DocumentMenuAction) => void,
  options: {
    platform: DesktopPlatform;
    sendApplicationAction: (action: ApplicationMenuAction) => void;
  } = { platform: "linux", sendApplicationAction: () => {} },
): ApplicationMenuItem[] {
  const { platform, sendApplicationAction } = options;
  const separator: ApplicationMenuItem = { type: "separator" };
  const file = (
    label: string,
    action: DocumentMenuAction,
  ): ApplicationMenuItem => ({
    label,
    accelerator: menuAccelerator(action, platform),
    click: () => send(action),
  });
  const command = (
    role: ApplicationMenuItem["role"],
    shortcut: DesktopMenuCommand,
  ): ApplicationMenuItem => ({
    role,
    accelerator: menuAccelerator(shortcut, platform),
  });
  const appAction = (
    label: string,
    action: ApplicationMenuAction,
  ): ApplicationMenuItem => ({
    label,
    click: () => sendApplicationAction(action),
  });
  const menu: ApplicationMenuItem[] = [
    {
      label: "&File",
      submenu: [
        file("New Project…", "new"),
        file("Open Project…", "open"),
        separator,
        file("Save", "save"),
        file("Save As…", "save_as"),
        separator,
        file("Close Project", "close"),
        ...(platform === "darwin" ? [] : [separator, command("quit", "quit")]),
      ],
    },
    {
      label: "&Edit",
      submenu: [
        command("undo", "undo"),
        command("redo", "redo"),
        separator,
        command("cut", "cut"),
        command("copy", "copy"),
        command("paste", "paste"),
        separator,
        command("selectAll", "select_all"),
      ],
    },
    {
      label: "&View",
      submenu: [
        command("resetZoom", "zoom_reset"),
        command("zoomIn", "zoom_in"),
        command("zoomOut", "zoom_out"),
        separator,
        command("togglefullscreen", "toggle_fullscreen"),
        ...(platform === "darwin"
          ? [separator, appAction("Appearance…", "appearance")]
          : []),
      ],
    },
    { role: "windowMenu" },
  ];
  if (platform === "darwin") {
    menu.unshift({
      role: "appMenu",
      submenu: [
        { role: "about" },
        separator,
        { ...appAction("Settings…", "settings"), accelerator: menuAccelerator("settings", platform) },
        separator,
        { role: "services" },
        separator,
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        separator,
        command("quit", "quit"),
      ],
    });
    menu.push({
      label: "Help",
      submenu: [
        appAction("Keyboard Shortcuts…", "shortcuts"),
        appAction("Check for Updates…", "updates"),
      ],
    });
  }
  return menu;
}
