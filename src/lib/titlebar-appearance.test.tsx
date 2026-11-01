// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Header } from "../components/Header";
import type { Result } from "../../shared/result";
const colors = vi.hoisted(() => ({ color: "#111111", symbolColor: "#eeeeee" }));
vi.mock("./titlebar-colors", () => ({
  readTitlebarColors: () => ({ ok: true, value: { ...colors } }),
}));
vi.mock("./update-client", () => ({
  updateClient: {
    getStatus: async () => ({ state: "current", installed_version: "1.0.3" }),
    subscribe: () => () => {},
  },
}));
vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(0), 0),
);
vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "showbiz", {
    value: undefined,
    configurable: true,
  });
  colors.color = "#111111";
  document.documentElement.removeAttribute("data-material");
});
it("applies resolved opaque colors to native controls and follows appearance changes", async () => {
  const apply = vi.fn(async (): Promise<Result<null>> => ({
    ok: true,
    value: null,
  }));
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "win32", customTitlebar: true, titleBarHeight: 48 },
      setTitleBarAppearance: apply,
    },
  });
  render(createElement(Header));
  await waitFor(() =>
    expect(apply).toHaveBeenCalledWith({
      color: "#111111",
      symbolColor: "#eeeeee",
    }),
  );
  colors.color = "#ffffff";
  act(() => {
    document.documentElement.setAttribute("data-material", "native");
  });
  await waitFor(() =>
    expect(apply).toHaveBeenLastCalledWith({
      color: "#ffffff",
      symbolColor: "#eeeeee",
    }),
  );
});
it("shows a native color failure with a working Retry action", async () => {
  const apply = vi.fn(async (): Promise<Result<null>> => ({
    ok: true,
    value: null,
  }));
  apply.mockResolvedValueOnce({
    ok: false,
    error: { code: "IO_ERROR", message: "Window colors could not be updated." },
  });
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "linux", customTitlebar: true, titleBarHeight: 48 },
      setTitleBarAppearance: apply,
    },
  });
  render(createElement(Header));
  expect(await screen.findByRole("alert")).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(apply).toHaveBeenCalledTimes(2);
});
it("reserves the actual overlay geometry only while native controls are visible", async () => {
  const overlay = Object.assign(new EventTarget(), {
    visible: true,
    getTitlebarAreaRect: () => ({ x: 0, right: window.innerWidth - 146 }),
  });
  Object.defineProperty(navigator, "windowControlsOverlay", {
    configurable: true,
    value: overlay,
  });
  Object.defineProperty(window, "showbiz", {
    configurable: true,
    value: {
      desktop: { platform: "linux", customTitlebar: true, titleBarHeight: 48 },
    },
  });
  try {
    render(createElement(Header));
    const header = screen.getByRole("banner");
    expect(header.style.paddingRight).toBe("154px");
    act(() => {
      overlay.visible = false;
      overlay.dispatchEvent(new Event("geometrychange"));
    });
    expect(header.style.paddingRight).toBe("12px");
  } finally {
    Object.defineProperty(navigator, "windowControlsOverlay", {
      configurable: true,
      value: undefined,
    });
  }
});
it("keeps space for macOS traffic lights with an incomplete overlay rect and releases it in fullscreen", () => {
  const overlay = Object.assign(new EventTarget(), { visible: true, getTitlebarAreaRect: () => ({ x: 0, right: window.innerWidth }) });
  Object.defineProperty(navigator, "windowControlsOverlay", { configurable: true, value: overlay });
  Object.defineProperty(window, "showbiz", { configurable: true, value: { desktop: { platform: "darwin", customTitlebar: true, titleBarHeight: 48 } } });
  try {
    render(createElement(Header));
    const header = screen.getByRole("banner");
    expect(header.style.paddingLeft).toBe("88px");
    act(() => { overlay.visible = false; overlay.dispatchEvent(new Event("geometrychange")); });
    expect(header.style.paddingLeft).toBe("12px");
  } finally { Object.defineProperty(navigator, "windowControlsOverlay", { configurable: true, value: undefined }); }
});
