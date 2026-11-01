import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import {
  createDesktopShell,
  desktopShellMetadata,
  desktopWindowOptions,
  rendererMenuGesture,
} from "./desktop-shell";
import { createWorkRuntime } from "./work-runtime";

function fixture(platform = "linux") {
  const mainFrame = { url: "http://localhost:1420/#/project/film" };
  const contents = {
    id: 7,
    mainFrame,
    isDestroyed: () => false,
    send: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    getZoomLevel: vi.fn(() => 1),
    setZoomLevel: vi.fn(),
  };
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: vi.fn(() => false),
    setAutoHideMenuBar: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    setTitleBarOverlay: vi.fn(),
    isFullScreen: vi.fn(() => false),
    setFullScreen: vi.fn(),
  });
  const quit = vi.fn();
  const shell = createDesktopShell({
    platform,
    rendererUrl: "http://localhost:1420/",
    quit,
  });
  const detach = shell.attachWindow(window);
  return {
    shell,
    window,
    contents,
    quit,
    detach,
    event: { sender: contents, senderFrame: mainFrame },
  };
}
it("uses native caption overlays without removing the resize frame", () => {
  for (const platform of ["linux", "win32"]) {
    const options = desktopWindowOptions(platform, true);
    expect(options).toMatchObject({
      titleBarStyle: "hidden",
      autoHideMenuBar: false,
      titleBarOverlay: { height: 48, color: "#151515", symbolColor: "#ffffff" },
    });
    expect(options).not.toHaveProperty("frame", false);
    expect(desktopShellMetadata(platform)).toEqual({
      platform,
      customTitlebar: true,
      titleBarHeight: 48,
    });
  }
  expect(desktopWindowOptions("darwin", false)).toMatchObject({
    titleBarStyle: "hiddenInset",
    titleBarOverlay: true,
  });
  expect(desktopWindowOptions("unsupported", false)).toEqual({});
  expect(desktopShellMetadata("unsupported")).toBeUndefined();
});
it("hides the in-window menu without enabling Alt auto-hide behavior", () => {
  const { window } = fixture();
  expect(window.setAutoHideMenuBar).toHaveBeenCalledWith(false);
  expect(window.setMenuBarVisibility).toHaveBeenCalledWith(false);
  const mac = fixture("darwin");
  expect(mac.window.setMenuBarVisibility).not.toHaveBeenCalled();
});
it.each(["undo", "redo", "cut", "copy", "paste", "select_all"] as const)(
  "dispatches %s to its own renderer",
  (command) => {
    const { shell, event, contents } = fixture();
    expect(shell.runMenuCommand(event, command)).toEqual({
      ok: true,
      value: null,
    });
    const method = command === "select_all" ? "selectAll" : command;
    expect(contents[method]).toHaveBeenCalledOnce();
  },
);
it("matches native zoom steps and toggles fullscreen", () => {
  const { shell, event, contents, window } = fixture();
  shell.runMenuCommand(event, "zoom_in");
  shell.runMenuCommand(event, "zoom_out");
  shell.runMenuCommand(event, "zoom_reset");
  expect(contents.setZoomLevel.mock.calls).toEqual([[1.5], [0.5], [0]]);
  shell.runMenuCommand(event, "toggle_fullscreen");
  expect(window.setFullScreen).toHaveBeenCalledWith(true);
});
it("rejects arbitrary commands, subframes, navigation and detached senders", () => {
  const { shell, event, contents, quit, detach } = fixture();
  for (const command of [
    "executeJavaScript",
    "open_project_document",
    {},
    null,
  ])
    expect(shell.runMenuCommand(event, command)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
  expect(
    shell.runMenuCommand(
      { ...event, senderFrame: { url: contents.mainFrame.url } },
      "quit",
    ).ok,
  ).toBe(false);
  expect(
    shell.runMenuCommand({ ...event, sender: { ...contents } }, "quit").ok,
  ).toBe(false);
  contents.mainFrame.url = "https://example.com/";
  expect(shell.runMenuCommand(event, "quit").ok).toBe(false);
  contents.mainFrame.url = "http://localhost:1420/#/";
  detach();
  expect(shell.runMenuCommand(event, "quit").ok).toBe(false);
  expect(quit).not.toHaveBeenCalled();
});
it("validates opaque titlebar colors and changes only the caller's overlay", () => {
  const { shell, event, window } = fixture();
  for (const input of [
    null,
    {},
    [],
    { color: "transparent", symbolColor: "#ffffff" },
    { color: "#000000", symbolColor: "#ffffff", height: 0 },
  ])
    expect(shell.setTitleBarAppearance(event, input).ok).toBe(false);
  expect(
    shell.setTitleBarAppearance(event, {
      color: "#101010",
      symbolColor: "#eEeEeE",
    }),
  ).toEqual({ ok: true, value: null });
  expect(window.setTitleBarOverlay).toHaveBeenCalledExactlyOnceWith({
    color: "#101010",
    symbolColor: "#eEeEeE",
  });
  const mac = fixture("darwin");
  expect(
    mac.shell.setTitleBarAppearance(mac.event, {
      color: "#101010",
      symbolColor: "#ffffff",
    }).ok,
  ).toBe(true);
  expect(mac.window.setTitleBarOverlay).not.toHaveBeenCalled();
});
it("turns destroyed-window or native dispatch failures into explicit results", () => {
  const { shell, event, window, contents } = fixture();
  contents.copy.mockImplementationOnce(() => {
    throw new Error("closed");
  });
  expect(shell.runMenuCommand(event, "copy")).toMatchObject({
    ok: false,
    error: { code: "IO_ERROR" },
  });
  window.isDestroyed.mockReturnValue(true);
  expect(shell.runMenuCommand(event, "quit").ok).toBe(false);
});
it("allows renderer menu keys while retaining native command accelerators", () => {
  const normal = { key: "s", alt: false, control: false, meta: false };
  expect(rendererMenuGesture({ ...normal, key: "Alt", alt: true })).toBe(true);
  expect(rendererMenuGesture({ ...normal, key: "f", alt: true })).toBe(true);
  expect(rendererMenuGesture({ ...normal, key: "F10" })).toBe(true);
  expect(rendererMenuGesture({ ...normal, key: "F10", control: true })).toBe(
    false,
  );
  expect(rendererMenuGesture({ ...normal, control: true })).toBe(false);
  expect(rendererMenuGesture({ ...normal, meta: true })).toBe(false);
});
it("keeps integrated Quit behind the existing unsaved-work cancellation guard", async () => {
  const { window, contents, event } = fixture();
  const quit = vi.fn();
  const confirm = vi.fn(async () => ({ response: 0 }));
  const work = createWorkRuntime({ windows: () => [window], quit, confirm });
  contents.send.mockImplementation((channel, request_id) => {
    if (channel === "showbiz:prepare_shutdown")
      void work.invoke(
        7,
        "report_shutdown_state",
        { request_id, unsaved: ["draft"], revision: 1 },
        vi.fn(),
      );
  });
  const preventDefault = vi.fn();
  const shell = createDesktopShell({
    platform: "linux",
    rendererUrl: "http://localhost:1420/",
    quit: () => work.beforeQuit({ preventDefault }),
  });
  shell.attachWindow(window);
  expect(shell.runMenuCommand(event, "quit").ok).toBe(true);
  expect(preventDefault).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(quit).not.toHaveBeenCalled();
  expect(work.work.getStatus().closing).toBe(false);
});
it("detaches a closed native window without reading its destroyed webContents", () => {
  const { shell, window, contents, event, detach } = fixture();
  detach();
  let destroyed = false;
  Object.defineProperty(window, "webContents", {
    get() {
      if (destroyed) throw new TypeError("Object has been destroyed");
      return contents;
    },
  });
  window.isDestroyed.mockImplementation(() => destroyed);
  const cleanup = shell.attachWindow(window);
  window.once("closed", cleanup);
  const live = fixture();
  live.contents.id = 8;
  shell.attachWindow(live.window);

  destroyed = true;
  expect(() => window.emit("closed")).not.toThrow();
  expect(cleanup).not.toThrow();
  expect(shell.runMenuCommand(event, "copy").ok).toBe(false);
  expect(contents.copy).not.toHaveBeenCalled();
  expect(shell.runMenuCommand(live.event, "copy")).toEqual({
    ok: true,
    value: null,
  });
  expect(live.contents.copy).toHaveBeenCalledOnce();
});
