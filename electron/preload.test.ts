import { expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  expose: vi.fn(), on: vi.fn(), removeListener: vi.fn(), invoke: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: native.expose },
  ipcRenderer: { on: native.on, removeListener: native.removeListener, invoke: native.invoke },
}));
import "./preload";

it("forwards only update status and removes the exact listener on unsubscribe", () => {
  const bridge = native.expose.mock.calls[0][1];
  const listener = vi.fn();
  const unsubscribe = bridge.onUpdateStatus(listener);
  const [channel, receive] = native.on.mock.calls[0];
  const status = { state: "available", available_version: "1.1.0" };
  receive({ sender: "private Electron event" }, status);
  expect(channel).toBe("showbiz:update_status");
  expect(listener).toHaveBeenCalledExactlyOnceWith(status);
  unsubscribe();
  expect(native.removeListener).toHaveBeenCalledExactlyOnceWith(channel, receive);
});
