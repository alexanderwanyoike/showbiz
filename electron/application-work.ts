import { WORK_LABELS, type ActiveWork, type ApplicationWorkStatus, type ShutdownIntent, type UnsavedWork } from "../shared/application-work";

export function createApplicationWork(options: {
  prepare: () => Promise<void>;
  confirm: (intent: ShutdownIntent, unsaved: UnsavedWork[]) => Promise<boolean>;
}) {
  const operations = new Map<symbol, ActiveWork>();
  const listeners = new Set<(status: ApplicationWorkStatus) => void>();
  let unsaved: UnsavedWork[] = [];
  let revision = 0;
  let pending = false;
  let closing = false;
  const getStatus = (): ApplicationWorkStatus => ({ active: [...new Set(operations.values())], unsaved: [...unsaved], closing });
  function publish() {
    for (const listener of listeners) listener(getStatus());
  }
  function assertIdle() {
    if (operations.size) throw new Error(`Finish ${getStatus().active.map((kind) => WORK_LABELS[kind]).join(", ")} before closing Showbiz.`);
  }
  return {
    getStatus,
    changed() { revision++; },
    subscribe(listener: (status: ApplicationWorkStatus) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    begin(kind: ActiveWork) {
      if (closing) throw new Error("Showbiz is closing. New work cannot start.");
      const id = Symbol(kind);
      operations.set(id, kind);
      revision++;
      publish();
      return () => { if (operations.delete(id)) { revision++; publish(); } };
    },
    setUnsaved(next: UnsavedWork[]) {
      const normalized = [...new Set(next)].sort();
      if (JSON.stringify(normalized) === JSON.stringify(unsaved)) return;
      unsaved = normalized;
      revision++;
      publish();
    },
    unlock() { closing = false; publish(); },
    async shutdown(intent: ShutdownIntent, commit: () => void | Promise<void>) {
      if (pending || closing) throw new Error("A close or install request is already in progress.");
      pending = true;
      try {
        await options.prepare();
        assertIdle();
        const confirmedRevision = revision;
        if ((intent === "install" || unsaved.length > 0) && !await options.confirm(intent, [...unsaved])) return false;
        await options.prepare();
        if (revision !== confirmedRevision) throw new Error("Your work changed while confirming. Review it and try again.");
        assertIdle();
        // Hold this lock through the installer's asynchronous staging and quit.
        closing = true;
        publish();
        await commit();
        return true;
      } catch (error) {
        closing = false;
        publish();
        throw error;
      } finally {
        pending = false;
      }
    },
  };
}
