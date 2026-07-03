import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { appDataDir, loadMigrations, openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
import { createHttpCommands } from "./commands/http";
import { createMediaCommands } from "./commands/media";
import { createSettingsCommands } from "./commands/settings";
import { createInvokeHandler } from "./ipc";
import { resolveMediaPath } from "./media";

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.SHOWBIZ_DEV_SERVER_URL ?? "http://localhost:1420";

if (isDev) {
  // First-class verification: agents drive the app over CDP in dev.
  app.commandLine.appendSwitch("remote-debugging-port", "9223");
}

function openShowbizDatabase() {
  const dataDir = path.join(appDataDir(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  // Migrations are shared with the Rust shell (single source of truth during
  // coexistence). Packaged-build resolution is a Phase 4 concern.
  const migrations = loadMigrations(
    path.join(app.getAppPath(), "src-tauri/src/migrations")
  );
  return openDatabase(path.join(dataDir, "showbiz.db"), migrations);
}

function registerIpc() {
  const db = openShowbizDatabase();
  const invokeHandler = createInvokeHandler({
    ...createProjectCommands(db),
    ...createMediaCommands(path.join(appDataDir(), "media")),
    ...createSettingsCommands(db),
    ...createHttpCommands(),
  });
  ipcMain.handle("showbiz:invoke", (_event, cmd: string, args?: Record<string, unknown>) =>
    invokeHandler(cmd, args)
  );

  const mediaDir = path.join(appDataDir(), "media");
  ipcMain.handle("showbiz:read-media-bytes", (_event, relativePath: string) =>
    fs.promises.readFile(resolveMediaPath(mediaDir, relativePath))
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Showbiz",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    // Vite may still be starting; retry until it answers.
    let attempts = 0;
    win.webContents.on("did-fail-load", () => {
      if (attempts++ < 50) {
        setTimeout(() => win.loadURL(DEV_SERVER_URL), 300);
      }
    });
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
