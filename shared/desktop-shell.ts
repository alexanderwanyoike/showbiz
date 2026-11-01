export type DesktopPlatform = "linux" | "win32" | "darwin";

export interface DesktopShellMetadata {
  platform: DesktopPlatform;
  customTitlebar: true;
  titleBarHeight: 48;
}

export type DesktopMenuCommand =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "select_all"
  | "zoom_in"
  | "zoom_out"
  | "zoom_reset"
  | "toggle_fullscreen"
  | "quit";

export interface DesktopTitleBarAppearance {
  color: string;
  symbolColor: string;
}

export type ApplicationMenuAction = "settings" | "appearance" | "shortcuts" | "updates";
