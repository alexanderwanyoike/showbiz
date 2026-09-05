// @vitest-environment jsdom
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { createWorkRuntime } from "../../electron/work-runtime";
import { applicationWork, connectApplicationWork, withApplicationWork } from "./application-work";

let disconnect = () => {};
afterEach(() => {
  disconnect();
  delete window.showbiz;
  applicationWork.receive({ active: [], unsaved: [], closing: false });
});
function setup() {
  const events = new Map<string, (payload: any) => void>();
  const appWindow = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: { id: 1, isDestroyed: () => false, send: (channel: string, payload: unknown) => events.get(channel)?.(payload) },
  });
  const confirm = vi.fn(async () => ({ response: 0 }));
  const runtime = createWorkRuntime({ windows: () => [appWindow], confirm, quit: vi.fn() });
  const commands = vi.fn(async (_command: string) => ({ state: "downloaded" }));
  const subscribe = (channel: string) => (cb: (payload: any) => void) => {
    events.set(channel, cb); return () => { events.delete(channel); };
  };
  window.showbiz = {
    invoke: <T>(command: string, args?: Record<string, unknown>) => runtime.invoke(1, command, args, commands) as Promise<T>,
    onApplicationWork: subscribe("showbiz:application_work"),
    onPrepareShutdown: subscribe("showbiz:prepare_shutdown"),
    onUpdateStatus: () => () => {}, onExportProgress: () => () => {}, readMediaBytes: async () => new Uint8Array(),
  };
  disconnect = connectApplicationWork();
  return { runtime, commands, confirm, events };
}

it("blocks native installation for the entire renderer operation, including polling gaps and saving", async () => {
  const { runtime, commands, confirm } = setup();
  let finish!: () => void;
  const save = vi.fn(async () => {});
  const running = withApplicationWork("generation", async () => {
    await new Promise<void>((resolve) => { finish = resolve; });
    await save();
  });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(applicationWork.getStatus().active).toContain("generation");
  await expect(runtime.invoke(1, "install_update", undefined, commands)).rejects.toThrow("Finish");
  expect(confirm).not.toHaveBeenCalled();
  finish(); await running;
  expect(save).toHaveBeenCalledOnce();
  expect(applicationWork.getStatus().active).toEqual([]);
  await runtime.invoke(1, "install_update", undefined, commands);
  expect(confirm).toHaveBeenCalledOnce();
  expect(commands.mock.calls.map(([cmd]) => cmd)).not.toContain("install_update");
});

it("answers native shutdown requests with fresh drafts and removes bridge subscriptions", async () => {
  const { runtime, commands, confirm, events } = setup();
  const editor = Symbol();
  applicationWork.setUnsaved(editor, "credentials");
  await runtime.invoke(1, "install_update", undefined, commands);
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ buttons: ["Cancel", "Discard and relaunch"] }));
  expect(applicationWork.snapshot().unsaved).toEqual(["credentials"]);
  applicationWork.setUnsaved(editor, null);
  disconnect();
  expect(events.size).toBe(0);
});
