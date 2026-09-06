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

it.each([
  ["onApplicationWork", "showbiz:application_work", { active: ["export"], unsaved: [], closing: false }],
  ["onPrepareShutdown", "showbiz:prepare_shutdown", "request-1"],
])("scopes %s subscriptions to payloads and cleans up", (method, channel, payload) => {
  native.on.mockClear(); native.removeListener.mockClear();
  const bridge = native.expose.mock.calls[0][1];
  const listener = vi.fn();
  const unsubscribe = bridge[method as string](listener);
  const receive = native.on.mock.calls[0][1];
  receive({ sender: "private" }, payload);
  expect(native.on.mock.calls[0][0]).toBe(channel);
  expect(listener).toHaveBeenCalledExactlyOnceWith(payload);
  unsubscribe();
  expect(native.removeListener).toHaveBeenCalledExactlyOnceWith(channel, receive);
});
