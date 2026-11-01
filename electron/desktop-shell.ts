import type { BrowserWindowConstructorOptions } from "electron";
import type {
  DesktopMenuCommand,
  DesktopShellMetadata,
  DesktopTitleBarAppearance,
} from "../shared/desktop-shell";
import type { Result } from "../shared/result";

interface DesktopFrame {
  url: string;
}
interface DesktopContents {
  id: number;
  mainFrame: DesktopFrame;
  isDestroyed(): boolean;
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
  getZoomLevel(): number;
  setZoomLevel(level: number): void;
}
interface DesktopWindow {
  webContents: DesktopContents;
  isDestroyed(): boolean;
  setAutoHideMenuBar(hidden: boolean): void;
  setMenuBarVisibility(visible: boolean): void;
  isFullScreen(): boolean;
  setFullScreen(fullscreen: boolean): void;
  setTitleBarOverlay(appearance: DesktopTitleBarAppearance): void;
}
interface DesktopSender {
  sender: Pick<DesktopContents, "id" | "mainFrame">;
  senderFrame: DesktopFrame | null;
}

export function desktopShellMetadata(
  platform: string,
): DesktopShellMetadata | undefined {
  if (platform !== "linux" && platform !== "win32" && platform !== "darwin")
    return undefined;
  return { platform, customTitlebar: true, titleBarHeight: 48 };
}

export function desktopWindowOptions(
  platform: string,
  dark: boolean,
): Pick<
  BrowserWindowConstructorOptions,
  "titleBarStyle" | "titleBarOverlay" | "autoHideMenuBar" | "backgroundColor" | "trafficLightPosition"
> {
  if (!desktopShellMetadata(platform)) return {};
  const color = dark ? "#151515" : "#f5f5f5";
  return {
    titleBarStyle: platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay:
      platform === "darwin"
        ? true
        : { color, symbolColor: dark ? "#ffffff" : "#151515", height: 48 },
    ...(platform === "darwin" ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    autoHideMenuBar: false,
    backgroundColor: color,
  };
}

export function rendererMenuGesture(input: {
  key: string;
  alt: boolean;
  control: boolean;
  meta: boolean;
}): boolean {
  return !input.control && !input.meta && (input.alt || input.key === "F10");
}

const menuCommands: readonly DesktopMenuCommand[] = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "select_all",
  "zoom_in",
  "zoom_out",
  "zoom_reset",
  "toggle_fullscreen",
  "quit",
];
function isMenuCommand(value: unknown): value is DesktopMenuCommand {
  return (
    typeof value === "string" &&
    menuCommands.some((command) => command === value)
  );
}
function isAppearance(value: unknown): value is DesktopTitleBarAppearance {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("color" in value) ||
    !("symbolColor" in value)
  )
    return false;
  const hex = (color: unknown) =>
    typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
  return hex(value.color) && hex(value.symbolColor);
}
function sameRenderer(candidate: string, expected: string): boolean {
  try {
    const source = new URL(candidate),
      target = new URL(expected);
    return (
      source.protocol === target.protocol &&
      source.host === target.host &&
      source.pathname === target.pathname &&
      source.search === target.search
    );
  } catch {
    return false;
  }
}
const invalid = (message: string): Result<never> => ({
  ok: false,
  error: { code: "INVALID_INPUT", message },
});

export function createDesktopShell(options: {
  platform: string;
  rendererUrl: string;
  quit: () => void;
}) {
  const windows = new Map<number, DesktopWindow>();
  function senderWindow(event: DesktopSender): Result<DesktopWindow> {
    const window = windows.get(event.sender.id);
    if (!window || window.webContents !== event.sender)
      return invalid(
        "This command is only available in the main Showbiz window.",
      );
    if (window.isDestroyed() || window.webContents.isDestroyed())
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "This Showbiz window is closed." },
      };
    if (
      event.senderFrame !== event.sender.mainFrame ||
      !event.senderFrame ||
      !sameRenderer(event.senderFrame.url, options.rendererUrl)
    )
      return invalid(
        "This command is only available in the main Showbiz window.",
      );
    return { ok: true, value: window };
  }
  return {
    attachWindow(window: DesktopWindow) {
      // Closed handlers run after BrowserWindow accessors become invalid.
      const webContentsId = window.webContents.id;
      windows.set(webContentsId, window);
      if (options.platform === "linux" || options.platform === "win32") {
        window.setAutoHideMenuBar(false);
        window.setMenuBarVisibility(false);
      }
      return () => {
        windows.delete(webContentsId);
      };
    },
    runMenuCommand(event: DesktopSender, command: unknown): Result<null> {
      if (!isMenuCommand(command))
        return invalid("Choose an available desktop menu command.");
      const target = senderWindow(event);
      if (!target.ok) return target;
      const window = target.value,
        contents = window.webContents;
      try {
        switch (command) {
          case "undo":
            contents.undo();
            break;
          case "redo":
            contents.redo();
            break;
          case "cut":
            contents.cut();
            break;
          case "copy":
            contents.copy();
            break;
          case "paste":
            contents.paste();
            break;
          case "select_all":
            contents.selectAll();
            break;
          case "zoom_in":
            contents.setZoomLevel(contents.getZoomLevel() + 0.5);
            break;
          case "zoom_out":
            contents.setZoomLevel(contents.getZoomLevel() - 0.5);
            break;
          case "zoom_reset":
            contents.setZoomLevel(0);
            break;
          case "toggle_fullscreen":
            window.setFullScreen(!window.isFullScreen());
            break;
          case "quit":
            options.quit();
            break;
        }
        return { ok: true, value: null };
      } catch {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: "Could not run this desktop menu command.",
          },
        };
      }
    },
    setTitleBarAppearance(
      event: DesktopSender,
      appearance: unknown,
    ): Result<null> {
      if (!isAppearance(appearance))
        return invalid("Use opaque six-digit hexadecimal title bar colors.");
      const target = senderWindow(event);
      if (!target.ok) return target;
      try {
        if (options.platform === "linux" || options.platform === "win32")
          target.value.setTitleBarOverlay(appearance);
        return { ok: true, value: null };
      } catch {
        return {
          ok: false,
          error: {
            code: "IO_ERROR",
            message: "Could not update the title bar appearance.",
          },
        };
      }
    },
  };
}
