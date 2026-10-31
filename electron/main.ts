import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { appDataDir, loadMigrations, openDatabase } from "./db";
import { createProjectRuntime } from "./project-runtime";
import { createStoryboardPackageCommands } from "./commands/storyboard-package";
import { createInvokeHandler } from "./ipc";
import { resolveMediaPath } from "./media";
import { projectApplicationMenu } from "./app-menu";
import { createWorkRuntime } from "./work-runtime";
import { createUpdateRuntime } from "./update-runtime";

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

function registerIpc(updates: ReturnType<typeof createUpdateRuntime>, work: ReturnType<typeof createWorkRuntime>) {
  const db = openShowbizDatabase();
  const filters = [{ name: "Showbiz project", extensions: ["showbiz"] }];
  const projects = createProjectRuntime({
    appDirectory: appDataDir(), legacyDb: db,
    migrations: loadMigrations(path.join(app.getAppPath(), "electron/migrations")),
    exports: (db, media) => createStoryboardPackageCommands(db, media, (options) => dialog.showSaveDialog(options)),
    chooseOpen: async () => {
      const result = await dialog.showOpenDialog({ title: "Open Project", filters, properties: ["openFile"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    chooseSave: async (name) => {
      const result = await dialog.showSaveDialog({ title: "Save Project", defaultPath: name, filters });
      return result.canceled ? null : result.filePath ?? null;
    },
    canSwitch: () => {
      const status = work.work.getStatus();
      return !status.active.length && !status.unsaved.length && !status.closing;
    },
    beginSave: () => work.work.begin("saving"),
    changed: (info) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.setTitle(info ? `${info.name} - Showbiz` : "Showbiz");
        window.setRepresentedFilename(info?.file_path ?? "");
        window.webContents.send("showbiz:project_document", info);
      }
      if (info) app.addRecentDocument(info.file_path);
    },
  });
  const updateHandler = createInvokeHandler(updates.commands);
  const invokeHandler = (command: string, args?: Record<string, unknown>) => command in updates.commands ? updateHandler(command, args) : projects.invoke(command, args);
  app.on("will-quit", () => { void projects.dispose(); db.close(); });

  ipcMain.handle("showbiz:invoke", (event, cmd: string, args?: Record<string, unknown>) => {
    return work.invoke(event.sender.id, cmd, args, invokeHandler);
  });

  ipcMain.handle("showbiz:read-media-bytes", (_event, relativePath: string) =>
    fs.promises.readFile(resolveMediaPath(projects.mediaDirectory() ?? (() => { throw new Error("Open a project first."); })(), relativePath))
  );
}

function createWindow(work: ReturnType<typeof createWorkRuntime>) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Showbiz",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });

  work.attachWindow(win);

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
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    ...projectApplicationMenu((action) => {
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      window?.webContents.send("showbiz:document_action", action);
    }),
  ]));
  const work = createWorkRuntime({
    windows: () => BrowserWindow.getAllWindows(),
    confirm: (options) => {
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
    },
    quit: () => app.quit(),
  });
  app.on("before-quit", work.beforeQuit);
  const updates = createUpdateRuntime({}, work.updateChanged, work.install);
  registerIpc(updates, work);
  createWindow(work);
  void updates.start();
});

app.on("window-all-closed", () => app.quit());
