import { useEffect, useRef, useState } from "react";
import type { UpdateStatus } from "../../shared/update-status";
import { updateClient, type UpdateClient } from "../lib/update-client";

export function useUpdates(client: UpdateClient = updateClient) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const initialRevision = revision.current;
    const unsubscribe = client.subscribe((next) => {
      revision.current++;
      setStatus(next);
      setError(null);
    });
    let active = true;
    void client.getStatus().then((next) => {
      if (active && initialRevision === revision.current) setStatus(next);
    }).catch(() => {
      if (active && initialRevision === revision.current) setError("Update status could not be loaded. Reopen Settings to try again.");
    });
    return () => { active = false; mounted.current = false; unsubscribe(); };
  }, [client]);

  async function run(action: () => Promise<UpdateStatus | void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const initialRevision = revision.current;
    setPending(true);
    setError(null);
    try {
      const next = await action();
      if (mounted.current && next && revision.current === initialRevision) setStatus(next);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return { status, error, pending, run };
}
