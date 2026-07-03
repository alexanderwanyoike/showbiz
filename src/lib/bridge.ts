import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Runtime bridge: the frontend calls invoke() without knowing which shell it
// runs in. Electron's preload exposes window.showbiz; absent that, Tauri.
export interface ElectronBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  readMediaBytes(relativePath: string): Promise<Uint8Array>;
}

declare global {
  interface Window {
    showbiz?: ElectronBridge;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && window.showbiz !== undefined;
}

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window !== "undefined" && window.showbiz) {
    return window.showbiz.invoke<T>(cmd, args);
  }
  return tauriInvoke<T>(cmd, args);
}
