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
  const commit = vi.fn();
  const command = vi.fn(async (cmd: string, _args?: Record<string, unknown>) => {
    if (cmd === "install_update") await runtime.install(commit);
    return { state: "downloaded" };
  });
  return { runtime, window, command, confirm, quit, commit };
}

describe("application work runtime", () => {
  it("holds native export until the real command finishes, including rejection", async () => {
    const { runtime, confirm } = setup();
    confirm.mockResolvedValue({ response: 0 });
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

  it("confirms guarded installation and preserves cancellation", async () => {
    const { runtime, command, confirm, commit } = setup();
    confirm.mockResolvedValueOnce({ response: 0 });
    expect(await runtime.invoke(7, "install_update", undefined, command)).toEqual({ state: "downloaded" });
    expect(commit).not.toHaveBeenCalled();
    expect(runtime.work.getStatus().closing).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("locks new work through installer staging and releases on failure", async () => {
    const { runtime, command } = setup();
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
  const { runtime, window, confirm, command, commit } = setup();
  let revision = 1;
  window.webContents.send.mockImplementation((channel, request_id) => {
    if (channel === "showbiz:prepare_shutdown") void runtime.invoke(7, "report_shutdown_state", { request_id, unsaved: ["credentials"], revision }, command);
  });
  confirm.mockImplementation(async () => { revision++; return { response: 1 }; });
  await expect(runtime.invoke(7, "install_update", {}, command)).rejects.toThrow("changed");
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ buttons: ["Cancel", "Discard and relaunch"], defaultId: 0, cancelId: 0 }));
  expect(commit).not.toHaveBeenCalled();
});

it("allows an explicit quit after an unresponsive renderer but never installs", async () => {
  vi.useFakeTimers();
  try {
    const { runtime, window, quit, confirm } = setup();
    window.webContents.send.mockImplementation(() => {});
    confirm.mockResolvedValueOnce({ response: 0 });
    const cancelled = runtime.requestQuit();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await cancelled).toBe(false);
    expect(quit).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ buttons: ["Keep working", "Quit anyway"], cancelId: 0, defaultId: 0 }));
    confirm.mockResolvedValueOnce({ response: 1 });
    const accepted = runtime.requestQuit();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await accepted).toBe(true);
    expect(quit).toHaveBeenCalledOnce();
    expect(runtime.work.getStatus().closing).toBe(true);
  } finally { vi.useRealTimers(); }
});

it("permits explicit abandonment of active work only for normal quit", async () => {
  const { runtime, quit, command, confirm } = setup();
  const end = runtime.work.begin("export");
  await expect(runtime.invoke(7, "install_update", undefined, command)).rejects.toThrow("Finish");
  expect(confirm).not.toHaveBeenCalled();
  expect(await runtime.requestQuit()).toBe(true);
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ buttons: ["Keep working", "Quit anyway"] }));
  expect(quit).toHaveBeenCalledOnce();
  end();
});

it.each(["get_projects", "get_shots", "get_api_key_status", "http_request", "show_export_save_dialog"])("does not classify %s as saving", async (cmd) => {
  const { runtime } = setup();
  let finish!: () => void;
  const pending = runtime.invoke(7, cmd, {}, () => new Promise<void>((r) => { finish = r; }));
  expect(runtime.work.getStatus().active).toEqual([]);
  finish(); await pending;
});

it.each(["save_api_key", "update_shot", "copy_image_from_shot", "switch_to_version", "ensure_default_tracks"])("protects %s until persistence finishes", async (cmd) => {
  const { runtime } = setup();
  let finish!: () => void;
  const pending = runtime.invoke(7, cmd, {}, () => new Promise<void>((r) => { finish = r; }));
  expect(runtime.work.getStatus().active).toEqual(["saving"]);
  finish(); await pending;
  expect(runtime.work.getStatus().active).toEqual([]);
});
