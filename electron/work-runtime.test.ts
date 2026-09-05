import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createWorkRuntime } from "./work-runtime";

function setup() {
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => false, webContents: { id: 7, isDestroyed: () => false, send: vi.fn() } });
  const confirm = vi.fn(async () => ({ response: 1 }));
  const quit = vi.fn();
  const runtime = createWorkRuntime({ windows: () => [window], confirm, quit });
  window.webContents.send.mockImplementation((channel, request_id) => {
    if (channel === "showbiz:prepare_shutdown") void runtime.invoke(7, "report_shutdown_state", { request_id, unsaved: [], revision: 0 }, vi.fn());
  });
  const command = vi.fn(async (_cmd: string, _args?: Record<string, unknown>) => ({ state: "downloaded" }));
  return { runtime, window, command, confirm, quit };
}

describe("application work runtime", () => {
  it("holds native export until the real command finishes, including rejection", async () => {
    const { runtime } = setup();
    let reject!: (e: Error) => void;
    const running = runtime.invoke(7, "export_timeline_video", {}, () => new Promise((_, r) => { reject = r; }));
    expect(runtime.work.getStatus().active).toEqual(["export"]);
    await expect(runtime.requestQuit()).resolves.toBe(false);
    reject(new Error("ffmpeg failed"));
    await expect(running).rejects.toThrow("ffmpeg failed");
    expect(runtime.work.getStatus().active).toEqual([]);
  });

  it("owns generation leases, validates kinds, and rejects another window's release", async () => {
    const { runtime, command } = setup();
    await expect(runtime.invoke(7, "begin_application_work", { kind: "export" }, command)).rejects.toThrow("kind");
    const work_id = await runtime.invoke(7, "begin_application_work", { kind: "generation" }, command);
    await expect(runtime.invoke(8, "end_application_work", { work_id }, command)).rejects.toThrow("work");
    expect(runtime.work.getStatus().active).toEqual(["generation"]);
    await runtime.invoke(7, "end_application_work", { work_id }, command);
    expect(runtime.work.getStatus().active).toEqual([]);
    expect(command).not.toHaveBeenCalled();
  });

  it("confirms installation only for a ready payload and preserves cancellation", async () => {
    const { runtime, command, confirm } = setup();
    confirm.mockResolvedValueOnce({ response: 0 });
    expect(await runtime.invoke(7, "install_update", undefined, command)).toEqual({ state: "downloaded" });
    expect(command.mock.calls.map(([cmd]) => cmd)).not.toContain("install_update");
    expect(runtime.work.getStatus().closing).toBe(false);
    command.mockResolvedValue({ state: "available" });
    await expect(runtime.invoke(7, "install_update", {}, command)).rejects.toThrow("verified");
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("locks new work through installer staging and releases on failure", async () => {
    const { runtime, command } = setup();
    command.mockImplementation(async (cmd) => ({ state: cmd === "install_update" ? "installing" : "downloaded" }));
    await runtime.invoke(7, "install_update", {}, command);
    await expect(runtime.invoke(7, "save_api_key", {}, command)).rejects.toThrow("closing");
    runtime.updateChanged({ state: "failed" });
    await runtime.invoke(7, "save_api_key", {}, command);
  });

  it("intercepts window close and permits the accepted app quit", async () => {
    const { runtime, window, quit } = setup();
    runtime.attachWindow(window);
    const preventDefault = vi.fn();
    window.emit("close", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
    const allowed = { preventDefault: vi.fn() };
    runtime.beforeQuit(allowed);
    expect(allowed.preventDefault).not.toHaveBeenCalled();
  });

  it("fails closed on malformed snapshots and unresponsive windows", async () => {
    vi.useFakeTimers();
    const { runtime, window, command, confirm } = setup();
    window.webContents.send.mockImplementation(() => {});
    const request = runtime.invoke(7, "install_update", {}, command);
    const rejection = expect(request).rejects.toThrow("not responding");
    await vi.advanceTimersByTimeAsync(5000);
    await rejection;
    expect(confirm).not.toHaveBeenCalled();
    await expect(runtime.invoke(7, "set_unsaved_work", { unsaved: ["secret"], revision: 0 }, command)).rejects.toThrow("Invalid");
    vi.useRealTimers();
  });
});

it("offers explicit discard for Settings and rejects a later edit of the same kind", async () => {
  const { runtime, window, confirm, command } = setup();
  let revision = 1;
  window.webContents.send.mockImplementation((channel, request_id) => {
    if (channel === "showbiz:prepare_shutdown") void runtime.invoke(7, "report_shutdown_state", { request_id, unsaved: ["credentials"], revision }, command);
  });
  confirm.mockImplementation(async () => { revision++; return { response: 1 }; });
  await expect(runtime.invoke(7, "install_update", {}, command)).rejects.toThrow("changed");
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ buttons: ["Cancel", "Discard and relaunch"], defaultId: 0, cancelId: 0 }));
  expect(command.mock.calls.map(([cmd]) => cmd)).not.toContain("install_update");
});
