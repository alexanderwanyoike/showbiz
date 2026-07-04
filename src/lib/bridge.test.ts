import { describe, it, expect, vi, afterEach } from "vitest";

import { invoke } from "./bridge";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("invoke", () => {
  it("routes through the Electron bridge", async () => {
    const electronInvoke = vi.fn().mockResolvedValue([{ id: "p1" }]);
    vi.stubGlobal("window", { showbiz: { invoke: electronInvoke } });

    const result = await invoke("get_projects", { limit: 1 });

    expect(electronInvoke).toHaveBeenCalledWith("get_projects", { limit: 1 });
    expect(result).toEqual([{ id: "p1" }]);
  });

  it("rejects with the bare error string, stripping Electron's IPC wrapping", async () => {
    // Electron wraps handler throws as:
    //   Error invoking remote method 'showbiz:invoke': Error: <msg>
    // UI code does String(e) and must see the bare <msg>.
    const electronInvoke = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'showbiz:invoke': Error: API key cannot be empty"
        )
      );
    vi.stubGlobal("window", { showbiz: { invoke: electronInvoke } });

    await expect(invoke("save_api_key")).rejects.toBe("API key cannot be empty");
  });

  it("normalizes non-Error rejections from the Electron bridge to strings", async () => {
    const electronInvoke = vi.fn().mockRejectedValue("plain failure");
    vi.stubGlobal("window", { showbiz: { invoke: electronInvoke } });

    await expect(invoke("anything")).rejects.toBe("plain failure");
  });

  it("rejects when no bridge is exposed", async () => {
    vi.stubGlobal("window", {});

    await expect(invoke("get_projects")).rejects.toMatch(/bridge .* unavailable/);
  });
});
