import { closeProjectStorage } from "./project-shutdown";
import {
  createProjectFileOpening,
  projectFileArguments,
} from "./project-file-opening";
import type { DocumentResult } from "../shared/project-document";
import { desktopAppIconPath } from "./app-icon";
import { integrateLinuxDesktop } from "./linux-desktop-integration";
import { createMcpSession } from "./mcp/session";
import { createAgentGenerationRuntime } from "./agent-generation/runtime";
import {
  AGENT_JOB_REPORT_CHANNEL,
  AGENT_RESPONSE_CHANNEL,
} from "../shared/agent-generation";
import { startLocalBridge } from "./mcp/local-bridge";
import {
  createDesktopShell,
  desktopShellMetadata,
  desktopWindowOptions,
  rendererMenuGesture,
} from "./desktop-shell";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  nativeTheme,
} from "electron";
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
// Agent work is answered only by the window Showbiz created, never by a child window.
let mainWindow: BrowserWindow | null = null;
let abandonAgentWork: (windowId: number) => void = () => {};
const DEV_SERVER_URL =
  process.env.SHOWBIZ_DEV_SERVER_URL ?? "http://localhost:1420";
const projectFiles = createProjectFileOpening((file, message) =>
  dialog.showErrorBox("Could not open project", `${file}\n\n${message}`),
);
app.on("open-file", (event, file) => {
  event.preventDefault();
  projectFiles.add(file);
});
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else
  app.on("second-instance", (_event, argv, workingDirectory) => {
    for (const file of projectFileArguments(argv, workingDirectory))
      projectFiles.add(file);
    const window = BrowserWindow.getAllWindows()[0];
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
for (const file of projectFileArguments(process.argv.slice(isDev ? 2 : 1)))
  projectFiles.add(file);

if (isDev) {
  // First-class verification: agents drive the app over CDP in dev.
  app.commandLine.appendSwitch("remote-debugging-port", "9223");
}

function openShowbizDatabase() {
  const dataDir = path.join(appDataDir(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const migrations = loadMigrations(
    path.join(app.getAppPath(), "electron/migrations"),
  );
  return openDatabase(path.join(dataDir, "showbiz.db"), migrations);
}

async function registerIpc(
  updates: ReturnType<typeof createUpdateRuntime>,
  work: ReturnType<typeof createWorkRuntime>,
) {
  const db = openShowbizDatabase();
  const filters = [{ name: "Showbiz project", extensions: ["showbiz"] }];
  const projects = createProjectRuntime({
    appDirectory: appDataDir(),
    legacyDb: db,
    modelDirectory: path.join(app.getAppPath(), "src/lib/models/providers"),
    migrations: loadMigrations(
      path.join(app.getAppPath(), "electron/migrations"),
    ),
    exports: (db, media) =>
      createStoryboardPackageCommands(db, media, (options) =>
        dialog.showSaveDialog(options),
      ),
    chooseOpen: async () => {
      const result = await dialog.showOpenDialog({
        title: "Open Project",
        filters,
        properties: ["openFile"],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    chooseSave: async (name) => {
      const result = await dialog.showSaveDialog({
        title: "Save Project",
        defaultPath: name,
        filters,
      });
      return result.canceled ? null : (result.filePath ?? null);
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
  const agentsCanEdit = () => {
    const status = work.work.getStatus();
    return (
      status.unsaved.length === 0 &&
      status.active.length === 0 &&
      !status.closing
    );
  };
  const agentGeneration = createAgentGenerationRuntime({
    window: () =>
      mainWindow && !mainWindow.isDestroyed()
        ? {
            id: mainWindow.webContents.id,
            send: (channel, payload) =>
              mainWindow?.webContents.send(channel, payload),
          }
        : null,
    deviceDb: db,
    invoke: (command, args) => projects.invoke(command, args),
    canEdit: agentsCanEdit,
  });
  ipcMain.handle(AGENT_JOB_REPORT_CHANNEL, (event, update: unknown) =>
    agentGeneration.report(event.sender.id, update),
  );
  const agentHandler = createInvokeHandler(agentGeneration.commands);
  abandonAgentWork = agentGeneration.abandon;
  ipcMain.handle(
    AGENT_RESPONSE_CHANNEL,
    (event, requestId: unknown, answer: unknown) => {
      if (typeof requestId === "string")
        agentGeneration.respond(event.sender.id, requestId, answer);
    },
  );
  const invokeHandler = (command: string, args?: Record<string, unknown>) =>
    command in updates.commands
      ? updateHandler(command, args)
      : command in agentGeneration.commands
        ? agentHandler(command, args)
        : projects.invoke(command, args);
  app.on("will-quit", () => {
    const result = closeProjectStorage(
      projects.dispose,
      () => db.close(),
      path.join(appDataDir(), "logs", "project-storage.log"),
    );
    if (!result.ok)
      console.error("Could not close project storage:", result.error.message);
    const warning = projects.documents.warning();
    if (warning) console.warn(warning);
  });

  const session = createMcpSession(
    (command, args) => work.invoke(-1, command, args, invokeHandler),
    () => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send("showbiz:data_changed");
    },
    agentsCanEdit,
  );
  ipcMain.handle(
    "showbiz:invoke",
    async (event, cmd: string, args?: Record<string, unknown>) => {
      const result = await work.invoke(
        event.sender.id,
        cmd,
        args,
        invokeHandler,
      );
      session.recordResult(cmd, result);
      return result;
    },
  );
  try {
    const bridge = await startLocalBridge(session.call);
    app.once("will-quit", () => {
      void bridge
        .close()
        .catch((cause: unknown) =>
          console.error("Could not close the agent connection:", cause),
        );
    });
  } catch (cause) {
    console.error("The Showbiz agent connection is unavailable:", cause);
  }

  ipcMain.handle("showbiz:read-media-bytes", (_event, relativePath: string) =>
    fs.promises.readFile(
      resolveMediaPath(
        projects.mediaDirectory() ??
          (() => {
            throw new Error("Open a project first.");
          })(),
        relativePath,
      ),
    ),
  );
  return async (file: string): Promise<DocumentResult<unknown>> => {
    const result = await work.invoke(
      -1,
      "open_project_document",
      { file_path: file },
      invokeHandler,
    );
    session.recordResult("open_project_document", result);
    return result as DocumentResult<unknown>;
  };
}

function createWindow(
  work: ReturnType<typeof createWorkRuntime>,
  shell: ReturnType<typeof createDesktopShell>,
) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Showbiz",
    icon: desktopAppIconPath(app.getAppPath(), app.isPackaged),
    ...desktopWindowOptions(process.platform, nativeTheme.shouldUseDarkColors),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  mainWindow = win;
  const windowId = win.webContents.id;
  win.webContents.on("did-navigate", () => abandonAgentWork(windowId));
  win.webContents.on("render-process-gone", () => abandonAgentWork(windowId));
  win.webContents.on("destroyed", () => abandonAgentWork(windowId));

  work.attachWindow(win);
  const detachShell = shell.attachWindow(win);
  win.once("closed", detachShell);
  win.webContents.on("before-input-event", (_event, input) => {
    win.webContents.setIgnoreMenuShortcuts(rendererMenuGesture(input));
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

if (primaryInstance)
  app.whenReady().then(async () => {
    const integration = await integrateLinuxDesktop({
      platform: process.platform,
      packaged: app.isPackaged,
      appImage: process.env.APPIMAGE,
      dataHome: process.env.XDG_DATA_HOME,
      home: app.getPath("home"),
      icon: desktopAppIconPath(app.getAppPath(), app.isPackaged),
    });
    if (!integration.ok) console.error(integration.error.message);
    if (process.platform === "darwin")
      app.dock?.setIcon(desktopAppIconPath(app.getAppPath(), app.isPackaged));
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        projectApplicationMenu(
          (action) => {
            const window =
              BrowserWindow.getFocusedWindow() ??
              BrowserWindow.getAllWindows()[0];
            window?.webContents.send("showbiz:document_action", action);
          },
          {
            platform:
              desktopShellMetadata(process.platform)?.platform ?? "linux",
            sendApplicationAction: (action) => {
              const window =
                BrowserWindow.getFocusedWindow() ??
                BrowserWindow.getAllWindows()[0];
              window?.webContents.send(
                "showbiz:application_menu_action",
                action,
              );
            },
          },
        ),
      ),
    );
    const work = createWorkRuntime({
      windows: () => BrowserWindow.getAllWindows(),
      confirm: (options) => {
        const window =
          BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        return window
          ? dialog.showMessageBox(window, options)
          : dialog.showMessageBox(options);
      },
      quit: () => app.quit(),
    });
    app.on("before-quit", work.beforeQuit);
    const updates = createUpdateRuntime({}, work.updateChanged, work.install);
    const openProjectFile = await registerIpc(updates, work);
    const shell = createDesktopShell({
      platform: process.platform,
      rendererUrl: isDev
        ? DEV_SERVER_URL
        : pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href,
      quit: () => app.quit(),
    });
    ipcMain.handle("showbiz:menu-command", (event, command: unknown) =>
      shell.runMenuCommand(event, command),
    );
    ipcMain.handle(
      "showbiz:titlebar-appearance",
      (event, appearance: unknown) =>
        shell.setTitleBarAppearance(event, appearance),
    );
    createWindow(work, shell);
    projectFiles.ready(openProjectFile);
    void updates.start();
  });

app.on("window-all-closed", () => app.quit());
