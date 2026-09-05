import { app, BrowserWindow, shell } from "electron";
import electronUpdater from "electron-updater";
import { createUpdateService } from "./updates";

interface UpdateEnvironment {
  isPackaged: boolean;
  platform: string;
  arch: string;
  appImage?: string;
}

export function updateUnavailableReason(environment: UpdateEnvironment): string | null {
  if (!environment.isPackaged) return "Automatic updates are unavailable in development builds.";
  if (environment.platform === "linux" && environment.arch === "x64") {
    return environment.appImage ? null : "Use the AppImage for automatic updates, or download the latest installer manually.";
  }
  if ((environment.platform === "win32" && environment.arch === "x64") ||
      (environment.platform === "darwin" && environment.arch === "arm64")) return null;
  return "Automatic updates are unavailable for this installation. Download Showbiz manually.";
}

function withoutArguments<T>(handler: () => T) {
  return async (args?: Record<string, unknown>) => {
    if (args && Object.keys(args).length > 0) throw new Error("Update commands do not accept arguments.");
    return handler();
  };
}

export function createUpdateRuntime(environment: Partial<UpdateEnvironment> = {}, onStatus?: (status: { state: string }) => void) {
  const service = createUpdateService({
    currentVersion: app.getVersion(),
    unavailableReason: updateUnavailableReason({
      isPackaged: app.isPackaged, platform: process.platform, arch: process.arch,
      appImage: process.env.APPIMAGE, ...environment,
    }),
    createUpdater: () => {
      const updater = electronUpdater.autoUpdater;
      updater.logger = null;
      return updater;
    },
  });
  service.subscribe((status) => {
    onStatus?.(status);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send("showbiz:update_status", status);
      }
    }
  });

  return {
    start: service.start,
    commands: {
      get_update_status: withoutArguments(service.getStatus),
      check_for_updates: withoutArguments(service.check),
      download_update: withoutArguments(service.download),
      install_update: withoutArguments(service.install),
      open_update_release: withoutArguments(() => shell.openExternal(service.getStatus().release_url)),
    },
  };
}
