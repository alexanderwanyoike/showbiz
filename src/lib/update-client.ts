import type { UpdateStatus } from "../../shared/update-status";
import { invoke } from "./bridge";

export interface UpdateClient {
  getStatus(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
  openRelease(): Promise<void>;
  subscribe(listener: (status: UpdateStatus) => void): () => void;
}

export const updateClient: UpdateClient = {
  getStatus: () => invoke("get_update_status"),
  check: () => invoke("check_for_updates"),
  download: () => invoke("download_update"),
  install: () => invoke("install_update"),
  openRelease: () => invoke("open_update_release"),
  subscribe(listener) {
    if (typeof window === "undefined" || !window.showbiz?.onUpdateStatus) return () => {};
    return window.showbiz.onUpdateStatus(listener);
  },
};
