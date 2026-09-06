import type { UpdateStatus } from "../shared/update-status";

export interface UpdateInfo {
  version: string;
  releaseNotes?: string | { version: string; note: string | null }[] | null;
}

export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<{ updateInfo: UpdateInfo } | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

interface UpdateServiceOptions {
  currentVersion: string;
  createUpdater: () => Updater;
  unavailableReason?: string | null;
  now?: () => Date;
  reportError?: (error: unknown) => void;
  installGuard?: (install: () => void) => Promise<unknown>;
}

// Bound release-note payloads across IPC and the Settings view.
const MAX_RELEASE_NOTES_LENGTH = 20_000;
const RELEASES_URL = "https://github.com/alexanderwanyoike/showbiz/releases";

function failureMessage(state: UpdateStatus["state"]): string {
  switch (state) {
    case "checking": return "Could not check for a stable update. Try again or download Showbiz from GitHub Releases.";
    case "downloading": return "The update could not be downloaded and verified. Try again or use the manual download.";
    case "installing": return "The update could not be installed. Download it manually from GitHub Releases.";
    default: return "The update operation failed. Try again or use the manual download from GitHub Releases.";
  }
}

function stableVersionParts(version: string): number[] | null {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  const parts = version.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function isNewer(version: string, installed: string) {
  const next = stableVersionParts(version);
  const current = stableVersionParts(installed);
  if (!next || !current) throw new Error("Expected stable version metadata");
  for (let index = 0; index < 3; index++) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}

function releaseNotes(info: UpdateInfo): string {
  const notes = typeof info.releaseNotes === "string" ? info.releaseNotes
    : (info.releaseNotes ?? []).filter((entry) => entry.note).map((entry) => `${entry.version}\n${entry.note}`).join("\n\n");
  return notes.slice(0, MAX_RELEASE_NOTES_LENGTH);
}

export function createUpdateService(options: UpdateServiceOptions) {
  let started = false;
  let operationPending = false;
  const listeners = new Set<(status: UpdateStatus) => void>();
  let status: UpdateStatus = {
    state: options.unavailableReason ? "unavailable" : "idle", installed_version: options.currentVersion,
    available_version: null, release_notes: "", release_url: RELEASES_URL,
    last_checked_at: null, percent: null, error: null, unavailable_reason: options.unavailableReason ?? null,
  };
  let updater: Updater | undefined;
  const reportedErrors = new Set<unknown>();
  function fail(error: unknown, message: string) {
    if (!reportedErrors.has(error)) {
      reportedErrors.add(error);
      (options.reportError ?? ((reason) => console.error("Application update failed:", reason)))(error);
    }
    if (status.state === "failed") return;
    publish({ state: "failed", percent: null, error: message,
      ...(status.state === "checking" ? { last_checked_at: (options.now?.() ?? new Date()).toISOString() } : {}),
    });
  }

  function getStatus(): UpdateStatus {
    return { ...status };
  }

  function getUpdater() {
    if (!updater) {
      updater = options.createUpdater();
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = false;
      updater.allowDowngrade = false;
      updater.on("download-progress", ({ percent }) => {
        if (status.state === "downloading" && Number.isFinite(percent)) {
          publish({ percent: Math.min(100, Math.max(0, percent)) });
        }
      });
      updater.on("error", (error) => {
        fail(error, failureMessage(status.state));
      });
    }
    return updater;
  }

  function publish(change: Partial<UpdateStatus>) {
    status = { ...status, ...change };
    for (const listener of listeners) listener({ ...status });
  }

  async function check() {
    if (options.unavailableReason) return { ...status };
    if (operationPending) throw new Error("An update operation is already in progress.");
    if (status.state === "downloaded" || status.state === "installing") throw new Error("An update is already downloaded. Install it before checking again.");
    reportedErrors.clear();
    operationPending = true;
    publish({ state: "checking", available_version: null, release_notes: "", release_url: RELEASES_URL, error: null });
    try {
      const result = await getUpdater().checkForUpdates();
      if (getStatus().state !== "checking") return getStatus();
      if (!result) throw new Error("The updater did not perform a check");
      const last_checked_at = (options.now?.() ?? new Date()).toISOString();
      if (isNewer(result.updateInfo.version, options.currentVersion)) {
        publish({ state: "available", available_version: result.updateInfo.version, last_checked_at,
          release_notes: releaseNotes(result.updateInfo),
          release_url: `${RELEASES_URL}/tag/v${result.updateInfo.version}`,
        });
      } else {
        publish({ state: "current", last_checked_at });
      }
    } catch (error) {
      fail(error, failureMessage("checking"));
    } finally {
      operationPending = false;
    }
    return { ...status };
  }

  async function download() {
    if (operationPending) throw new Error("An update operation is already in progress.");
    if (status.state !== "available") throw new Error("Check for an available update before downloading.");
    reportedErrors.clear();
    operationPending = true;
    publish({ state: "downloading", percent: 0, error: null });
    try {
      const files = await getUpdater().downloadUpdate();
      if (getStatus().state !== "downloading") return getStatus();
      if (files.length === 0) throw new Error("No verified installer");
      publish({ state: "downloaded", percent: 100 });
    } catch (error) {
      fail(error, failureMessage("downloading"));
    } finally {
      operationPending = false;
    }
    return { ...status };
  }

  function assertDownloaded() {
    if (status.state !== "downloaded") throw new Error("A verified update must be downloaded before installation.");
  }

  async function install() {
    assertDownloaded();
    if (operationPending) throw new Error("An update operation is already in progress.");
    operationPending = true;
    reportedErrors.clear();
    const commit = () => {
      assertDownloaded();
      publish({ state: "installing", error: null });
      try { getUpdater().quitAndInstall(false, true); }
      catch (error) { fail(error, failureMessage("installing")); }
    };
    try {
      if (options.installGuard) await options.installGuard(commit);
      else commit();
    } finally { operationPending = false; }
    return getStatus();
  }

  return {
    getStatus,
    check,
    download,
    install,
    subscribe(listener: (status: UpdateStatus) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async start() {
      if (started) return;
      started = true;
      if (status.state !== "idle") return;
      await check();
    },
  };
}
