import { contextBridge, ipcRenderer } from "electron";

// The renderer-facing bridge; src/lib/bridge.ts detects this to pick the
// Electron shell over Tauri. Sandboxed preload: keep it a pure passthrough.
contextBridge.exposeInMainWorld("showbiz", {
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("showbiz:invoke", cmd, args),
  readMediaBytes: (relativePath: string) =>
    ipcRenderer.invoke("showbiz:read-media-bytes", relativePath),
  // Native export progress: main forwards ffmpeg percent here. Returns an
  // unsubscribe so the renderer can detach when an export ends.
  onExportProgress: (cb: (payload: { percent: number }) => void) => {
    const listener = (_event: unknown, payload: { percent: number }) => cb(payload);
    ipcRenderer.on("showbiz:export-progress", listener);
    return () => ipcRenderer.removeListener("showbiz:export-progress", listener);
  },
});
