import { describe, expect, it, vi } from "vitest";
import { createUpdateService } from "./updates";
import { EventEmitter } from "node:events";

function fakeUpdater() {
  return Object.assign(new EventEmitter(), {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    checkForUpdates: vi.fn().mockResolvedValue({ updateInfo: { version: "1.1.0", releaseNotes: "Improved editing" } }),
    downloadUpdate: vi.fn().mockResolvedValue(["verified-installer"]),
    quitAndInstall: vi.fn(),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("application updates", () => {
  it("checks once on startup and reports a newer release without downloading it", async () => {
    const updater = fakeUpdater();
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    const changed = vi.fn();
    service.subscribe(changed);

    await service.start();
    await service.start();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false });
    expect(service.getStatus()).toMatchObject({
      state: "available", installed_version: "1.0.2", available_version: "1.1.0",
      release_notes: "Improved editing",
      release_url: "https://github.com/alexanderwanyoike/showbiz/releases/tag/v1.1.0",
    });
    expect(changed.mock.calls.map(([status]) => status.state)).toEqual(["checking", "available"]);
  });

  it("does not construct or contact an updater when automatic updates are unavailable", async () => {
    const createUpdater = vi.fn(() => fakeUpdater());
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater, unavailableReason: "Development build" });
    await service.start();
    await service.check();
    expect(createUpdater).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ state: "unavailable", unavailable_reason: "Development build" });
  });

  it.each(["1.0.2", "1.0.1"])("reports current instead of offering %s", async (version) => {
    const updater = fakeUpdater();
    updater.checkForUpdates.mockResolvedValue({ updateInfo: { version } });
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater, now: () => new Date("2026-09-05T12:00:00Z") });
    await service.check();
    expect(service.getStatus()).toMatchObject({ state: "current", available_version: null, last_checked_at: "2026-09-05T12:00:00.000Z" });
  });

  it.each(["1.1.0-beta.1", "../malicious", "1.01.0", "1.1.0+build"])("rejects non-stable update metadata %s", async (version) => {
    const updater = fakeUpdater();
    updater.checkForUpdates.mockResolvedValue({ updateInfo: { version } });
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.check();
    expect(service.getStatus()).toMatchObject({ state: "failed", available_version: null, release_url: "https://github.com/alexanderwanyoike/showbiz/releases" });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("downloads only on request, reports progress, and installs only after verification", async () => {
    const updater = fakeUpdater();
    const pending = deferred<string[]>();
    updater.downloadUpdate.mockReturnValue(pending.promise);
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await expect(service.install()).rejects.toThrow(/download/);
    await service.check();
    const downloading = service.download();
    updater.emit("download-progress", { percent: 42 });
    expect(service.getStatus()).toMatchObject({ state: "downloading", percent: 42 });
    await expect(service.install()).rejects.toThrow(/download/);
    pending.resolve(["verified-installer"]);
    await downloading;
    expect(service.getStatus()).toMatchObject({ state: "downloaded", percent: 100 });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await service.install();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(service.getStatus().state).toBe("installing");
  });

  it("rejects overlapping checks and preserves a downloaded update instead of checking again", async () => {
    const updater = fakeUpdater();
    const pending = deferred<{ updateInfo: { version: string } }>();
    updater.checkForUpdates.mockReturnValue(pending.promise);
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    const check = service.check();
    await expect(service.check()).rejects.toThrow(/already|progress/);
    pending.resolve({ updateInfo: { version: "1.1.0" } });
    await check;
    const download = service.download();
    await expect(service.download()).rejects.toThrow(/available|progress/);
    await expect(service.check()).rejects.toThrow(/progress|downloaded/);
    await download;
    await expect(service.check()).rejects.toThrow(/downloaded/);
    expect(service.getStatus().state).toBe("downloaded");
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("turns emitted updater errors into non-fatal failure and ignores late download success", async () => {
    const updater = fakeUpdater();
    const pending = deferred<string[]>();
    updater.downloadUpdate.mockReturnValue(pending.promise);
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.check();
    const download = service.download();
    updater.emit("error", new Error("private internal diagnostic"));
    await expect(service.check()).rejects.toThrow(/progress/);
    updater.emit("download-progress", { percent: 95 });
    pending.resolve(["untrusted-after-error"]);
    await download;
    expect(service.getStatus()).toMatchObject({ state: "failed", percent: null });
    expect(service.getStatus().error).not.toContain("private internal diagnostic");
    await expect(service.install()).rejects.toThrow(/verified/);
  });

  it("recovers from failed startup checks without exposing internal errors", async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates.mockRejectedValueOnce(new Error("internal network detail"));
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.start();
    expect(service.getStatus()).toMatchObject({ state: "failed", available_version: null });
    expect(service.getStatus().error).not.toContain("internal network detail");
    await service.check();
    expect(service.getStatus()).toMatchObject({ state: "available", error: null });
  });

  it("does not report current when the updater could not perform a check", async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates.mockResolvedValue(null);
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.check();
    expect(service.getStatus().state).toBe("failed");
  });

  it("keeps a manual check started before startup instead of duplicating it", async () => {
    const updater = fakeUpdater();
    const pending = deferred<{ updateInfo: { version: string } }>();
    updater.checkForUpdates.mockReturnValue(pending.promise);
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    const check = service.check();
    await service.start();
    pending.resolve({ updateInfo: { version: "1.1.0" } });
    await check;
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("preserves multi-version release notes as plain text", async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates.mockResolvedValue({ updateInfo: { version: "1.1.0", releaseNotes: [{ version: "1.1.0", note: "New editor" }, { version: "1.0.3", note: null }] } });
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.check();
    expect(service.getStatus().release_notes).toBe("1.1.0\nNew editor");
  });

  it.each([[], new Error("checksum mismatch")])("never installs a failed or empty download", async (result) => {
    const updater = fakeUpdater();
    if (result instanceof Error) updater.downloadUpdate.mockRejectedValue(result);
    else updater.downloadUpdate.mockResolvedValue(result);
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.check();
    await service.download();
    expect(service.getStatus().state).toBe("failed");
    await expect(service.install()).rejects.toThrow(/verified/);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("makes installation errors recoverable and rejects duplicate installation", async () => {
    const updater = fakeUpdater();
    const service = createUpdateService({ currentVersion: "1.0.2", createUpdater: () => updater });
    await service.check();
    await service.download();
    await service.install();
    await expect(service.install()).rejects.toThrow(/verified/);
    updater.emit("error", new Error("installation failed"));
    expect(service.getStatus().state).toBe("failed");
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
