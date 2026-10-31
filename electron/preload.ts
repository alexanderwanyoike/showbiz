import { contextBridge, ipcRenderer } from "electron";
import type { ApplicationWorkStatus } from "../shared/application-work";
import type { UpdateStatus } from "../shared/update-status";

// The renderer-facing bridge; src/lib/bridge.ts detects this to pick the
// Electron shell over Tauri. Sandboxed preload: keep it a pure passthrough.
contextBridge.exposeInMainWorld("showbiz", {
  onDataChanged: (callback: () => void) => {
    ipcRenderer.on("showbiz:data_changed", callback);
    return () => ipcRenderer.removeListener("showbiz:data_changed", callback);
  },
  onProjectDocument: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("showbiz:project_document", listener);
    return () => ipcRenderer.removeListener("showbiz:project_document", listener);
  },
  onDocumentAction: (cb: (action: "new" | "open" | "save" | "save_as" | "close") => void) => {
    const listener = (_event: unknown, action: "new" | "open" | "save" | "save_as" | "close") => cb(action);
    ipcRenderer.on("showbiz:document_action", listener);
    return () => ipcRenderer.removeListener("showbiz:document_action", listener);
  },
  onApplicationWork: (cb: (status: ApplicationWorkStatus) => void) => {
    const listener = (_event: unknown, status: ApplicationWorkStatus) => cb(status);
    ipcRenderer.on("showbiz:application_work", listener);
    return () => ipcRenderer.removeListener("showbiz:application_work", listener);
  },
  onPrepareShutdown: (cb: (request_id: string) => void) => {
    const listener = (_event: unknown, request_id: string) => cb(request_id);
    ipcRenderer.on("showbiz:prepare_shutdown", listener);
    return () => ipcRenderer.removeListener("showbiz:prepare_shutdown", listener);
  },
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => cb(status);
    ipcRenderer.on("showbiz:update_status", listener);
    return () => ipcRenderer.removeListener("showbiz:update_status", listener);
  },
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("showbiz:invoke", cmd, args),
  readMediaBytes: (relativePath: string) =>
    ipcRenderer.invoke("showbiz:read-media-bytes", relativePath),
});
