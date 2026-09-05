import { randomUUID } from "node:crypto";
import type { MessageBoxOptions } from "electron";
import { createApplicationWork } from "./application-work";
import { WORK_LABELS, type UnsavedWork } from "../shared/application-work";

interface WorkWindow {
  isDestroyed(): boolean;
  webContents: { id: number; isDestroyed(): boolean; send(channel: string, payload: unknown): void };
  on(event: "close", listener: (event: { preventDefault(): void }) => void): unknown;
}
type Dispatch = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function snapshot(args?: Record<string, unknown>) {
  if (!Array.isArray(args?.unsaved) || !args.unsaved.every((kind) => kind === "credentials" || kind === "draft") ||
    !Number.isSafeInteger(args.revision) || Number(args.revision) < 0) throw new Error("Invalid unsaved work status.");
  return { unsaved: [...new Set(args.unsaved)] as UnsavedWork[], revision: Number(args.revision) };
}

export function createWorkRuntime(options: {
  windows: () => WorkWindow[];
  confirm: (options: MessageBoxOptions) => Promise<{ response: number }>;
  quit: () => void;
}) {
  const leases = new Map<string, { owner: number; end: () => void }>();
  const drafts = new Map<number, ReturnType<typeof snapshot>>();
  const requests = new Map<string, { owner: number; resolve: () => void }>();
  let quitPending = false;
  const liveWindows = () => options.windows().filter((window) => !window.isDestroyed() && !window.webContents.isDestroyed());
  const work = createApplicationWork({
    prepare: async () => {
      await Promise.all(liveWindows().map((window) => new Promise<void>((resolve, reject) => {
        const request_id = randomUUID();
        const timeout = setTimeout(() => {
          requests.delete(request_id);
          reject(new Error("Showbiz is not responding. Wait for the window to recover before closing."));
        }, 5000);
        requests.set(request_id, { owner: window.webContents.id, resolve: () => {
          clearTimeout(timeout); requests.delete(request_id); resolve();
        } });
        try { window.webContents.send("showbiz:prepare_shutdown", request_id); }
        catch { clearTimeout(timeout); requests.delete(request_id); reject(new Error("Showbiz is not responding. Try again after the window recovers.")); }
      })));
    },
    confirm: async (intent, unsaved) => {
      const discard = unsaved.length > 0;
      const action = intent === "install" ? "relaunch" : "quit";
      const { response } = await options.confirm({
        type: "question", title: intent === "install" ? "Install update and relaunch?" : "Discard edits and quit?",
        message: intent === "install" ? "Showbiz will close, install the update, and relaunch." : "Showbiz will close.",
        detail: discard ? `You have ${unsaved.map((kind) => WORK_LABELS[kind]).join(" and ")}. Discard these edits to ${action}, or cancel to keep working.` : "Your saved projects and media will remain available.",
        buttons: ["Cancel", discard ? `Discard and ${action}` : "Install and relaunch"], defaultId: 0, cancelId: 0, noLink: true,
      });
      return response === 1;
    },
  });
  work.subscribe((status) => {
    for (const window of liveWindows()) window.webContents.send("showbiz:application_work", status);
  });
  function setDrafts(owner: number, args?: Record<string, unknown>) {
    const next = snapshot(args);
    const previous = drafts.get(owner);
    // A second edit of the same kind must invalidate an outstanding confirmation.
    if (previous && next.revision !== previous.revision) work.changed();
    drafts.set(owner, next);
    work.setUnsaved([...drafts.values()].flatMap((entry) => entry.unsaved));
  }
  async function requestQuit() {
    if (quitPending) return false;
    quitPending = true;
    try {
      return await work.shutdown("quit", options.quit);
    } catch (error) {
      await options.confirm({ type: "info", title: "Keep Showbiz open", message: error instanceof Error ? error.message : "Showbiz could not close safely. Try again.", buttons: ["Keep working"] });
      return false;
    } finally { quitPending = false; }
  }
  return {
    work,
    requestQuit,
    beforeQuit(event: { preventDefault(): void }) {
      if (work.getStatus().closing) return;
      event.preventDefault();
      void requestQuit();
    },
    attachWindow(window: WorkWindow) {
      window.on("close", (event) => {
        if (work.getStatus().closing) return;
        event.preventDefault();
        void requestQuit();
      });
    },
    updateChanged(status: { state: string }) { if (status.state === "failed") work.unlock(); },
    async invoke(owner: number, command: string, args: Record<string, unknown> | undefined, dispatch: Dispatch): Promise<unknown> {
      if (command === "get_application_work") return work.getStatus();
      if (command === "set_unsaved_work") { setDrafts(owner, args); return; }
      if (command === "report_shutdown_state") {
        const request = requests.get(String(args?.request_id));
        if (!request || request.owner !== owner) throw new Error("Unknown shutdown request.");
        setDrafts(owner, args);
        request.resolve();
        return;
      }
      if (command === "begin_application_work") {
        if (args?.kind !== "generation" && args?.kind !== "saving") throw new Error("Invalid application work kind.");
        const end = work.begin(args.kind);
        const work_id = randomUUID();
        leases.set(work_id, { owner, end });
        return work_id;
      }
      if (command === "end_application_work") {
        const work_id = String(args?.work_id);
        const lease = leases.get(work_id);
        if (!lease || lease.owner !== owner) throw new Error("Unknown application work.");
        lease.end(); leases.delete(work_id);
        return;
      }
      if (command === "install_update") {
        if (args && Object.keys(args).length) throw new Error("Update commands do not accept arguments.");
        const status = await dispatch("get_update_status") as { state: string };
        if (status.state !== "downloaded") throw new Error("A verified update must be downloaded before installation.");
        await work.shutdown("install", async () => {
          const result = await dispatch(command) as { state: string };
          if (result.state !== "installing") work.unlock();
        });
        return dispatch("get_update_status");
      }
      if (["get_update_status", "check_for_updates", "download_update", "open_update_release"].includes(command)) return dispatch(command, args);
      const end = work.begin(command === "export_timeline_video" ? "export" : "saving");
      try { return await dispatch(command, args); }
      finally { end(); }
    },
  };
}
