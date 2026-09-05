import { describe, expect, it, vi } from "vitest";
import { createApplicationWork } from "./application-work";

function setup() {
  const confirm = vi.fn(async () => true);
  const prepare = vi.fn(async () => {});
  const work = createApplicationWork({ confirm, prepare });
  return { work, confirm, prepare, commit: vi.fn() };
}

describe("guarded application shutdown", () => {
  it.each(["export", "generation", "saving"] as const)("blocks install and quit during %s", async (kind) => {
    const { work, confirm, commit } = setup();
    const end = work.begin(kind);
    for (const intent of ["install", "quit"] as const) {
      await expect(work.shutdown(intent, commit)).rejects.toThrow("Finish");
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    end();
    expect(await work.shutdown("install", commit)).toBe(true);
  });

  it.each(["credentials", "draft"] as const)("requires explicit discard for unsaved %s", async (kind) => {
    const { work, confirm, commit } = setup();
    work.setUnsaved([kind]);
    confirm.mockResolvedValueOnce(false);
    expect(await work.shutdown("install", commit)).toBe(false);
    expect(confirm).toHaveBeenCalledWith("install", [kind]);
    expect(commit).not.toHaveBeenCalled();
    expect(work.getStatus().unsaved).toEqual([kind]);
    expect(await work.shutdown("install", commit)).toBe(true);
  });

  it("preserves ready work on cancellation and releases the confirmation slot", async () => {
    const { work, confirm, commit } = setup();
    confirm.mockResolvedValueOnce(false);
    await work.shutdown("install", commit);
    const end = work.begin("generation");
    end();
    await work.shutdown("install", commit);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(() => work.begin("generation")).toThrow("closing");
  });

  it("rejects work that starts or changes during confirmation, even if it finishes", async () => {
    const { work, confirm, commit } = setup();
    confirm.mockImplementation(async () => { work.begin("export")(); return true; });
    await expect(work.shutdown("install", commit)).rejects.toThrow("changed");
    expect(commit).not.toHaveBeenCalled();
    confirm.mockImplementation(async () => { work.setUnsaved(["credentials"]); return true; });
    await expect(work.shutdown("install", commit)).rejects.toThrow("changed");
  });

  it("refreshes renderer drafts before and after the confirmation", async () => {
    const { work, prepare, commit } = setup();
    prepare.mockImplementationOnce(async () => { work.setUnsaved(["draft"]); });
    await work.shutdown("install", commit);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("fails closed if the renderer cannot answer, and allows a later retry", async () => {
    const { work, prepare, commit } = setup();
    prepare.mockRejectedValueOnce(new Error("Window is not responding"));
    await expect(work.shutdown("install", commit)).rejects.toThrow("not responding");
    expect(commit).not.toHaveBeenCalled();
    await work.shutdown("install", commit);
  });

  it("prevents duplicate confirmations and unlocks after a failed commit", async () => {
    const { work, confirm, commit } = setup();
    let resolve!: (v: boolean) => void;
    confirm.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const first = work.shutdown("install", commit);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await expect(work.shutdown("install", commit)).rejects.toThrow("already");
    resolve(false);
    await first;
    await expect(work.shutdown("install", () => { throw new Error("installer failed"); })).rejects.toThrow("installer failed");
    expect(() => work.begin("saving")()).not.toThrow();
  });

  it("counts overlapping operations and publishes immediate changes", () => {
    const { work } = setup();
    const listener = vi.fn();
    work.subscribe(listener);
    const end1 = work.begin("generation");
    const end2 = work.begin("generation");
    end1(); end1();
    expect(work.getStatus().active).toEqual(["generation"]);
    end2();
    expect(work.getStatus().active).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("quits without confirmation only when there is no unsaved work", async () => {
    const { work, confirm, commit } = setup();
    await work.shutdown("quit", commit);
    expect(confirm).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
  });
});
