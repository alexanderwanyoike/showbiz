import { contextBridge, ipcRenderer } from "electron";

// The renderer-facing bridge; src/lib/bridge.ts detects this to pick the
// Electron shell over Tauri. Sandboxed preload: keep it a pure passthrough.
contextBridge.exposeInMainWorld("showbiz", {
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("showbiz:invoke", cmd, args),
  readMediaBytes: (relativePath: string) =>
    ipcRenderer.invoke("showbiz:read-media-bytes", relativePath),
});
