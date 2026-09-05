// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRendererWork } from "./application-work";

function setup() {
  const invoke = vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => command === "begin_application_work" ? "lease-1" : undefined);
  return { invoke, work: createRendererWork(invoke) };
}

describe("renderer work tracking", () => {
  it("acquires a main-process lease before generation and holds it through saving", async () => {
    const { work, invoke } = setup();
    let finish!: () => void;
    const save = vi.fn();
    const running = work.run("generation", async () => { await new Promise<void>((r) => { finish = r; }); save(); return "image"; });
    expect(work.getStatus().active).toEqual(["generation"]);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(invoke).toHaveBeenCalledExactlyOnceWith("begin_application_work", { kind: "generation" });
    finish();
    expect(await running).toBe("image");
    expect(save).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenLastCalledWith("end_application_work", { work_id: "lease-1" });
    expect(work.getStatus().active).toEqual([]);
  });
  it("does not start work when the main process refuses a lease", async () => {
    const { work, invoke } = setup();
    invoke.mockRejectedValueOnce(new Error("closing"));
    const generate = vi.fn();
    await expect(work.run("generation", generate)).rejects.toThrow("closing");
    expect(generate).not.toHaveBeenCalled();
    expect(work.getStatus().active).toEqual([]);
  });
  it("releases failed operations and keeps overlapping work blocked", async () => {
    const { work, invoke } = setup();
    let finish!: () => void;
    const pending = work.run("generation", () => new Promise<void>((r) => { finish = r; }));
    await expect(work.run("generation", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(work.getStatus().active).toEqual(["generation"]);
    finish(); await pending;
    expect(invoke.mock.calls.filter(([cmd]) => cmd === "end_application_work")).toHaveLength(2);
  });
  it("reports only draft categories and a revision, preserving independent editors", async () => {
    const { work, invoke } = setup();
    const key = Symbol(), modal = Symbol();
    work.setUnsaved(key, "credentials");
    work.setUnsaved(modal, "draft");
    work.setUnsaved(key, null);
    expect(work.snapshot()).toEqual({ unsaved: ["draft"], revision: 3 });
    expect(invoke).toHaveBeenLastCalledWith("set_unsaved_work", { unsaved: ["draft"], revision: 3 });
    work.setUnsaved(modal, "draft");
    expect(work.snapshot().revision).toBe(4);
    work.setUnsaved(modal, null);
    expect(work.getStatus().unsaved).toEqual([]);
  });
  it("merges authoritative export status and notifies subscribers immediately", () => {
    const { work } = setup();
    const listener = vi.fn();
    const unsubscribe = work.subscribe(listener);
    work.receive({ active: ["export"], unsaved: [], closing: false });
    work.setUnsaved(Symbol(), "credentials");
    expect(work.getStatus()).toMatchObject({ active: ["export"], unsaved: ["credentials"] });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

it("recovers from a transient status failure when a fresh status arrives", () => {
  const { work } = setup();
  work.failed();
  expect(work.getStatus().error).toBeTruthy();
  work.receive({ active: [], unsaved: [], closing: false });
  expect(work.getStatus().error).toBeNull();
});

it("clears a transient error after a successful draft report without waiting for another event", async () => {
  const { work, invoke } = setup();
  const editor = Symbol();
  invoke.mockRejectedValueOnce(new Error("IPC interrupted"));
  work.setUnsaved(editor, "credentials");
  await vi.waitFor(() => expect(work.getStatus().error).toBeTruthy());
  work.setUnsaved(editor, "credentials");
  await vi.waitFor(() => expect(work.getStatus().error).toBeNull());
});
