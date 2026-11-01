import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => "process-start"),
}));
const platform = process.platform;
afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
});
it.each(["linux", "darwin", "win32"] as const)(
  "reads this process identity once on %s with unique owner tokens",
  async (target) => {
    Object.defineProperty(process, "platform", { value: target });
    const reader = vi.spyOn(fs, "readFileSync");
    const command = vi.mocked(execFileSync);
    const { createProcessOwner, processOwnerStatus } =
      await import("./process-owner");
    const first = createProcessOwner();
    const probes = reader.mock.calls.length + command.mock.calls.length;
    expect(probes).toBeGreaterThan(0);
    const next = createProcessOwner();
    expect(next.identity).toBe(first.identity);
    expect(next.token).not.toBe(first.token);
    expect(processOwnerStatus(first)).toBe("live");
    expect(reader.mock.calls.length + command.mock.calls.length).toBe(probes);
  },
);


it("retries a timed-out Windows identity probe and caches the first successful result", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const command = vi.mocked(execFileSync);
  command.mockImplementationOnce(() => {
    throw Object.assign(new Error("PowerShell start timed out"), { code: "ETIMEDOUT" });
  });
  const { createProcessOwner, processOwnerStatus } = await import("./process-owner");
  const unavailable = createProcessOwner();
  expect(unavailable.identity).toBeNull();
  const recovered = createProcessOwner();
  expect(recovered.identity).toBe("process-start");
  expect(processOwnerStatus(recovered)).toBe("live");
  expect(createProcessOwner().identity).toBe(recovered.identity);
  expect(command).toHaveBeenCalledTimes(2);
});
