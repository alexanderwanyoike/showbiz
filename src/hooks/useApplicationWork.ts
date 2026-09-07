import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { applicationWork } from "../lib/application-work";
import type { UnsavedWork } from "../../shared/application-work";

export function useApplicationWork() {
  return useSyncExternalStore(applicationWork.subscribe, applicationWork.getStatus);
}

export function useUnsavedWork(kind: UnsavedWork, dirty: boolean, value: unknown = dirty) {
  const id = useRef(Symbol(kind));
  useLayoutEffect(() => {
    applicationWork.setUnsaved(id.current, dirty ? kind : null);
  }, [kind, dirty, value]);
  useLayoutEffect(() => {
    const token = id.current;
    return () => applicationWork.setUnsaved(token, null);
  }, []);
}
