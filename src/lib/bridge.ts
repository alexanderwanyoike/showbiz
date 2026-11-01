import type { DesktopMenuCommand, DesktopShellMetadata, DesktopTitleBarAppearance } from "../../shared/desktop-shell";
import type { Result } from "../../shared/result";
import type { ApplicationWorkStatus } from "../../shared/application-work";
import type { UpdateStatus } from "../../shared/update-status";

// Runtime bridge to the Electron main process, exposed by the preload script
// as window.showbiz.
export interface ElectronBridge {
  desktop?: DesktopShellMetadata;
  runMenuCommand?(command: DesktopMenuCommand): Promise<Result<null>>;
  setTitleBarAppearance?(appearance: DesktopTitleBarAppearance): Promise<Result<null>>;
  onDataChanged?(callback: () => void): () => void;
  onProjectDocument?(cb: () => void): () => void;
  onDocumentAction?(cb: (action: "new" | "open" | "save" | "save_as" | "close") => void): () => void;
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  readMediaBytes(relativePath: string): Promise<Uint8Array>;
  onApplicationWork(cb: (status: ApplicationWorkStatus) => void): () => void;
  onPrepareShutdown(cb: (request_id: string) => void): () => void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
}

declare global {
  interface Window {
    showbiz?: ElectronBridge;
  }
}

// Electron's ipcRenderer.invoke wraps handler throws as
//   Error invoking remote method 'showbiz:invoke': Error: <msg>
// Strip that wrapping so UI code doing String(e) shows the bare message.
function toBareErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message
    .replace(/^Error invoking remote method '[^']+': /, "")
    .replace(/^Error: /, "");
}

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window === "undefined" || !window.showbiz) {
    return Promise.reject("Electron bridge (window.showbiz) is unavailable");
  }
  return window.showbiz.invoke<T>(cmd, args).catch((e: unknown) => {
    throw toBareErrorMessage(e);
  });
}
