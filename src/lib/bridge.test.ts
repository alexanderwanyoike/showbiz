import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("tauri-result"),
}));

import { invoke, isElectron } from "./bridge";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("isElectron", () => {
  it("is true when the Electron preload bridge is present", () => {
    vi.stubGlobal("window", { showbiz: { invoke: vi.fn() } });
    expect(isElectron()).toBe(true);
  });

  it("is false when no bridge is exposed", () => {
    vi.stubGlobal("window", {});
    expect(isElectron()).toBe(false);
  });

  it("is false outside a browser context", () => {
    expect(isElectron()).toBe(false);
  });
});

describe("invoke", () => {
  it("routes through the Electron bridge when present", async () => {
    const electronInvoke = vi.fn().mockResolvedValue([{ id: "p1" }]);
    vi.stubGlobal("window", { showbiz: { invoke: electronInvoke } });

    const result = await invoke("get_projects", { limit: 1 });

    expect(electronInvoke).toHaveBeenCalledWith("get_projects", { limit: 1 });
    expect(result).toEqual([{ id: "p1" }]);
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("falls back to Tauri invoke when no bridge is present", async () => {
    vi.stubGlobal("window", {});

    const result = await invoke("get_projects");

    expect(tauriInvoke).toHaveBeenCalledWith("get_projects", undefined);
    expect(result).toBe("tauri-result");
  });
});
