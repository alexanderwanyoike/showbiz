import type { ActiveWork, ApplicationWorkStatus, UnsavedWork } from "../../shared/application-work";
import { invoke } from "./bridge";

type WorkStatus = ApplicationWorkStatus & { error: string | null };
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function createRendererWork(send: Invoke) {
  const active = new Map<symbol, ActiveWork>();
  const drafts = new Map<symbol, UnsavedWork>();
  const listeners = new Set<() => void>();
  let remote: ApplicationWorkStatus = { active: [], unsaved: [], closing: false };
  let revision = 0;
  let error: string | null = null;
  let status: WorkStatus = { ...remote, error };
  const snapshot = () => ({ unsaved: [...new Set(drafts.values())].sort(), revision });
  function publish() {
    status = { active: [...new Set([...active.values(), ...remote.active])], unsaved: [...new Set([...drafts.values(), ...remote.unsaved])], closing: remote.closing, error };
    for (const listener of listeners) listener();
  }
  function failed() { error = "Work status could not be confirmed. Reopen Showbiz before installing an update."; publish(); }
  return {
    snapshot,
    getStatus: () => status,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    receive(next: ApplicationWorkStatus) { remote = next; publish(); },
    failed,
    setUnsaved(id: symbol, kind: UnsavedWork | null) {
      if (!kind && !drafts.has(id)) return;
      if (kind) drafts.set(id, kind); else drafts.delete(id);
      revision++;
      publish();
      void send("set_unsaved_work", snapshot()).catch(failed);
    },
    async run<T>(kind: "generation" | "saving", operation: () => Promise<T>): Promise<T> {
      if (remote.closing) throw new Error("Showbiz is closing. New work cannot start.");
      const id = Symbol(kind);
      active.set(id, kind); publish();
      let work_id: unknown;
      try {
        work_id = await send("begin_application_work", { kind });
        return await operation();
      } finally {
        try { if (work_id) await send("end_application_work", { work_id }); }
        catch { failed(); }
        active.delete(id); publish();
      }
    },
  };
}

const send: Invoke = (command, args) => typeof window !== "undefined" && window.showbiz ? invoke(command, args) : Promise.resolve(undefined);
export const applicationWork = createRendererWork(send);
export const withApplicationWork = applicationWork.run;

export function connectApplicationWork() {
  const bridge = window.showbiz;
  if (!bridge) return () => {};
  const stopStatus = bridge.onApplicationWork((status) => applicationWork.receive(status));
  const stopPrepare = bridge.onPrepareShutdown((request_id) => {
    void send("report_shutdown_state", { request_id, ...applicationWork.snapshot() }).catch(applicationWork.failed);
  });
  let received = false;
  const markReceived = applicationWork.subscribe(() => { received = true; });
  void invoke<ApplicationWorkStatus>("get_application_work").then((status) => {
    if (!received) applicationWork.receive(status);
  }).catch(applicationWork.failed);
  return () => { stopStatus(); stopPrepare(); markReceived(); };
}
