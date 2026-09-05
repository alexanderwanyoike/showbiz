import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const native = vi.hoisted(() => ({
  app: { isPackaged: false, getVersion: vi.fn(() => "1.0.2") },
  openExternal: vi.fn().mockResolvedValue(undefined),
  getAllWindows: vi.fn(() => []),
  getUpdater: vi.fn(),
}));
vi.mock("electron", () => ({
  app: native.app, shell: { openExternal: native.openExternal },
  BrowserWindow: { getAllWindows: native.getAllWindows },
}));
vi.mock("electron-updater", () => ({ default: { get autoUpdater() { return native.getUpdater(); } } }));
import { createUpdateRuntime, updateUnavailableReason } from "./update-runtime";

beforeEach(() => { vi.clearAllMocks(); native.app.isPackaged = false; });

describe("update runtime", () => {
  it("never loads or calls the real updater during development, including manual checks", async () => {
    const runtime = createUpdateRuntime();
    await runtime.start();
    const status = await runtime.commands.check_for_updates();
    expect(status.state).toBe("unavailable");
    expect(native.getUpdater).not.toHaveBeenCalled();
  });

  it.each([
    ["win32", "x64", undefined, null],
    ["darwin", "arm64", undefined, null],
    ["linux", "x64", "/opt/Showbiz.AppImage", null],
    ["linux", "x64", undefined, /AppImage/],
    ["darwin", "x64", undefined, /installation/],
  ] as const)("selects support for %s %s", (platform, arch, appImage, expected) => {
    const reason = updateUnavailableReason({ isPackaged: true, platform, arch, appImage });
    if (expected === null) expect(reason).toBeNull();
    else expect(reason).toMatch(expected);
  });

  it("exposes only fixed update operations and cannot accept a renderer-provided feed", async () => {
    const runtime = createUpdateRuntime();
    expect(Object.keys(runtime.commands).sort()).toEqual([
      "check_for_updates", "download_update", "get_update_status", "install_update", "open_update_release",
    ]);
    await expect(runtime.commands.check_for_updates({ url: "https://example.com/feed" })).rejects.toThrow(/arguments/);
    await runtime.commands.open_update_release();
    expect(native.openExternal).toHaveBeenCalledWith("https://github.com/alexanderwanyoike/showbiz/releases");
  });

  it("broadcasts packaged startup status to live windows", async () => {
    native.app.isPackaged = true;
    const updater = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn().mockResolvedValue({ updateInfo: { version: "1.1.0" } }),
    });
    native.getUpdater.mockReturnValue(updater);
    const send = vi.fn();
    native.getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { isDestroyed: () => false, send } }] as never);
    const runtime = createUpdateRuntime({ platform: "win32", arch: "x64" });
    await runtime.start();
    expect(send).toHaveBeenLastCalledWith("showbiz:update_status", expect.objectContaining({ state: "available" }));
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
