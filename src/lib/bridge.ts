// Runtime bridge to the Electron main process, exposed by the preload script
// as window.showbiz.
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
