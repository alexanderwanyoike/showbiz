import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Result } from "../shared/result";

export interface ProcessOwner {
  pid: number;
  identity: string | null;
  token: string;
}
function processIdentity(pid: number): Result<string> {
  try {
    let identity: string;
    if (process.platform === "linux") {
      const boot = fs
        .readFileSync("/proc/sys/kernel/random/boot_id", "utf8")
        .trim();
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      if (!start || !/^\d+$/.test(start))
        throw new Error("Invalid process start time.");
      identity = `${boot}:${start}`;
    } else if (process.platform === "darwin") {
      identity = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
        encoding: "utf8",
        timeout: 2000,
        env: { ...process.env, LC_ALL: "C" },
      }).trim();
    } else if (process.platform === "win32") {
      identity = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
        ],
        { encoding: "utf8", timeout: 3000, windowsHide: true },
      ).trim();
    } else throw new Error("Process identity is unavailable on this platform.");
    if (!identity) throw new Error("Process start time is unavailable.");
    return { ok: true, value: identity };
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
}
let ownIdentity: string | undefined;
function currentProcessIdentity(): Result<string> {
  if (ownIdentity !== undefined) return { ok: true, value: ownIdentity };
  const identity = processIdentity(process.pid);
  if (identity.ok) ownIdentity = identity.value;
  return identity;
}
export function createProcessOwner(): ProcessOwner {
  const identity = currentProcessIdentity();
  return {
    pid: process.pid,
    identity: identity.ok ? identity.value : null,
    token: randomUUID(),
  };
}
export function parseProcessOwner(value: unknown): ProcessOwner | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("pid" in value) ||
    !Number.isSafeInteger(value.pid) ||
    typeof value.pid !== "number" ||
    value.pid <= 0 ||
    !("identity" in value) ||
    !(value.identity === null || typeof value.identity === "string") ||
    !("token" in value) ||
    typeof value.token !== "string" ||
    !value.token
  )
    return null;
  return { pid: value.pid, identity: value.identity, token: value.token };
}
export function processOwnerStatus(
  owner: Pick<ProcessOwner, "pid" | "identity">,
): "live" | "dead" | "unknown" {
  try {
    process.kill(owner.pid, 0);
  } catch (cause) {
    return cause instanceof Error && "code" in cause && cause.code === "ESRCH"
      ? "dead"
      : "unknown";
  }
  if (owner.identity === null) return "unknown";
  const current =
    owner.pid === process.pid
      ? currentProcessIdentity()
      : processIdentity(owner.pid);
  return current.ok
    ? current.value === owner.identity
      ? "live"
      : "dead"
    : "unknown";
}
