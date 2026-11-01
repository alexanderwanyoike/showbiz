import { beforeEach, expect, it, vi } from "vitest";

const shell = vi.hoisted(() => ({
  lock: vi.fn(() => true),
  quit: vi.fn(),
  whenReady: vi.fn(() => new Promise<void>(() => {})),
  events: new Map<string, (...args: unknown[]) => void>(),
  add: vi.fn(),
  focus: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    requestSingleInstanceLock: shell.lock,
    quit: shell.quit,
    whenReady: shell.whenReady,
    on: (event: string, handler: (...args: unknown[]) => void) =>
      shell.events.set(event, handler),
  },
  BrowserWindow: {
    getAllWindows: () => [
      { isMinimized: () => true, restore: shell.restore, focus: shell.focus },
    ],
  },
  ipcMain: {},
  Menu: {},
  dialog: {},
  nativeTheme: {},
}));
vi.mock("./update-runtime", () => ({ createUpdateRuntime: vi.fn() }));
vi.mock("./project-file-opening", async (load) => {
  const actual = await load<typeof import("./project-file-opening")>();
  return {
    ...actual,
    createProjectFileOpening: () => ({ add: shell.add, ready: vi.fn() }),
  };
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  shell.events.clear();
});
it("forwards subsequent OS launches to the existing window and resolves relative project paths in the launcher's directory", async () => {
  shell.lock.mockReturnValue(true);
  await import("./main");
  expect(shell.lock).toHaveBeenCalledOnce();
  shell.add.mockClear();
  shell.events.get("second-instance")?.(
    {},
    ["showbiz", "relative.showbiz", "--inspect"],
    "/Films",
  );
  expect(shell.add).toHaveBeenCalledWith("/Films/relative.showbiz");
  expect(shell.restore).toHaveBeenCalledOnce();
  expect(shell.focus).toHaveBeenCalledOnce();
});
it("quits duplicate launches before opening device storage or starting the renderer", async () => {
  shell.lock.mockReturnValue(false);
  await import("./main");
  expect(shell.quit).toHaveBeenCalledOnce();
  expect(shell.whenReady).not.toHaveBeenCalled();
});
