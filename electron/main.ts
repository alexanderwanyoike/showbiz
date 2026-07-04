import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { appDataDir, loadMigrations, openDatabase } from "./db";
import { createProjectCommands } from "./commands/projects";
import { createShotCommands } from "./commands/shots";
import { createHttpCommands } from "./commands/http";
import { createMediaCommands } from "./commands/media";
import { createSettingsCommands } from "./commands/settings";
import { createTimelineCommands } from "./commands/timeline";
import { createBibleCommands } from "./commands/bibles";
import { createImageVersionCommands } from "./commands/image-versions";
import { createVideoVersionCommands } from "./commands/video-versions";
import { createExportCommandsForApp } from "./export-deps";
import { createInvokeHandler } from "./ipc";
import { resolveMediaPath } from "./media";
import { initMediaDirs, mediaBaseDir } from "./media-files";
import { hideDefaultApplicationMenu } from "./app-menu";

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.SHOWBIZ_DEV_SERVER_URL ?? "http://localhost:1420";

if (isDev) {
  // First-class verification: agents drive the app over CDP in dev.
  app.commandLine.appendSwitch("remote-debugging-port", "9223");
}

function openShowbizDatabase() {
  const dataDir = path.join(appDataDir(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const migrations = loadMigrations(
    path.join(app.getAppPath(), "electron/migrations")
  );
  return openDatabase(path.join(dataDir, "showbiz.db"), migrations);
}

function registerIpc() {
  const db = openShowbizDatabase();
  const mediaDir = mediaBaseDir(appDataDir());
  // Save helpers assume the media subdirectories exist, exactly like the Rust
  // shell where main.rs calls media::init() at startup.
  initMediaDirs(mediaDir);
  const invokeHandler = createInvokeHandler({
    ...createProjectCommands(db, mediaDir),
    ...createShotCommands(db, mediaDir),
    ...createMediaCommands(mediaDir),
    ...createSettingsCommands(db),
    ...createHttpCommands(),
    ...createTimelineCommands(db),
    ...createBibleCommands(db, mediaDir),
    ...createImageVersionCommands(db, mediaDir),
    ...createVideoVersionCommands(db, mediaDir),
    ...createExportCommandsForApp(db, mediaDir),
  });
  ipcMain.handle("showbiz:invoke", (_event, cmd: string, args?: Record<string, unknown>) =>
    invokeHandler(cmd, args)
  );

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
  hideDefaultApplicationMenu(Menu);
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
