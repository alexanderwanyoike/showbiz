import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Runtime bridge: the frontend calls invoke() without knowing which shell it
// runs in. Electron's preload exposes window.showbiz; absent that, Tauri.
export interface ElectronBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  readMediaBytes(relativePath: string): Promise<Uint8Array>;
  /** Subscribe to native export progress; returns an unsubscribe function. */
  onExportProgress(cb: (payload: { percent: number }) => void): () => void;
}

declare global {
  interface Window {
    showbiz?: ElectronBridge;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && window.showbiz !== undefined;
}

// Tauri rejects failed commands with the bare Err(String) value; Electron's
// ipcRenderer.invoke wraps handler throws as
//   Error invoking remote method 'showbiz:invoke': Error: <msg>
// Strip that wrapping so both shells reject identically and UI code doing
// String(e) shows the same message.
function toBareErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message
    .replace(/^Error invoking remote method '[^']+': /, "")
    .replace(/^Error: /, "");
}

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window !== "undefined" && window.showbiz) {
    return window.showbiz.invoke<T>(cmd, args).catch((e: unknown) => {
      throw toBareErrorMessage(e);
    });
  }
  return tauriInvoke<T>(cmd, args);
}
