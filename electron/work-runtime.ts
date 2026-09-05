import { randomUUID } from "node:crypto";
import type { MessageBoxOptions } from "electron";
import { createApplicationWork } from "./application-work";
import { WORK_LABELS, type UnsavedWork } from "../shared/application-work";

interface WorkWindow {
  isDestroyed(): boolean;
  webContents: { id: number; isDestroyed(): boolean; send(channel: string, payload: unknown): void };
  on(event: "close", listener: (event: { preventDefault(): void }) => void): unknown;
}
const MUTATING_COMMANDS = new Set([
  "add_timeline_clip",
  "clear_shot_end_frame",
  "copy_image_from_shot",
  "create_bible",
  "create_bible_asset",
  "create_bible_asset_variant",
  "create_generation_version",
  "create_project",
  "create_remix_version",
  "create_shot",
  "create_storyboard",
  "create_timeline_track",
  "create_video_generation_version",
  "delete_api_key",
  "delete_bible",
  "delete_bible_asset",
  "delete_bible_asset_variant",
  "delete_project",
  "delete_shot",
  "delete_storyboard",
  "delete_timeline_track",
  "delete_version",
  "ensure_default_tracks",
  "move_timeline_clip",
  "remove_all_timeline_clips",
  "remove_timeline_clip",
  "reorder_shots",
  "save_and_complete_video",
  "save_api_key",
  "save_shot_end_frame",
  "save_shot_image",
  "save_shot_video",
  "split_timeline_clip",
  "switch_to_version",
  "switch_to_video_version",
  "update_bible",
  "update_bible_asset",
  "update_bible_asset_variant_status",
  "update_project",
  "update_shot",
  "update_storyboard",
  "update_storyboard_models",
  "update_timeline_clip_trims",
]);

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
    for (const window of liveWindows()) {
      try { window.webContents.send("showbiz:application_work", status); }
      catch (error) { console.error("Could not send application work status:", error); }
    }
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
      const { response } = await options.confirm({
        type: "warning", title: "Quit Showbiz anyway?",
        message: error instanceof Error ? error.message : "Showbiz could not confirm that it is safe to close.",
        detail: "Quitting now may interrupt exports or generation and discard unsaved edits. An unresponsive window may contain work Showbiz cannot check. This will quit without installing an update.",
        buttons: ["Keep working", "Quit anyway"], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (response !== 1) return false;
      await work.quitAnyway(options.quit);
      return true;
    } finally { quitPending = false; }
  }
  return {
    work,
    requestQuit,
    install: (commit: () => void) => {
      if (quitPending) return Promise.reject(new Error("A quit request is already in progress."));
      return work.shutdown("install", commit);
    },
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
      if (!MUTATING_COMMANDS.has(command) && command !== "export_timeline_video") return dispatch(command, args);
      const end = work.begin(command === "export_timeline_video" ? "export" : "saving");
      try { return await dispatch(command, args); }
      finally { end(); }
    },
  };
}
