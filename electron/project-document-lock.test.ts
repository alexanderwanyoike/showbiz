import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { lockProjectDocument } from "./project-document-lock";
import { createProcessOwner } from "./process-owner";

it("allows only one owner when two contenders reclaim the same dead lock", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "showbiz-lock-race-"),
  );
  const file = path.join(directory, "Film.showbiz");
  const lock = `${file}.lock`;
  fs.writeFileSync(
    lock,
    JSON.stringify({
      ...createProcessOwner(),
      identity: "previous-incarnation",
    }),
  );
  const unlink = fs.unlinkSync;
  let competingOwner = false;
  let competingError = "";
  let attempt = true;
  const hook = vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
    if (target === lock && attempt) {
      attempt = false;
      try {
        lockProjectDocument(file);
        competingOwner = true;
      } catch (cause) {
        competingError = cause instanceof Error ? cause.message : String(cause);
      }
    }
    unlink(target);
  });
  try {
    const release = lockProjectDocument(file);
    expect(competingOwner).toBe(false);
    expect(competingError).toContain("lock");
    release();
    expect(fs.existsSync(lock)).toBe(false);
  } finally {
    hook.mockRestore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    ),
);
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-lock-"));
  directories.push(directory);
  return path.join(directory, "Film.showbiz");
}
it("reclaims a lock whose PID belongs to a different process incarnation", () => {
  const file = fixture();
  fs.writeFileSync(
    `${file}.lock`,
    JSON.stringify({
      pid: process.pid,
      identity: "previous-boot:previous-process",
      token: "stale",
    }),
  );
  const release = lockProjectDocument(file);
  try {
    expect(() => lockProjectDocument(file)).toThrow("already open");
  } finally {
    release();
  }
});
it("names the lock file when a legacy live-PID lock cannot be verified", () => {
  const file = fixture();
  fs.writeFileSync(`${file}.lock`, String(process.pid));
  expect(() => lockProjectDocument(file)).toThrow(`${file}.lock`);
  expect(fs.readFileSync(`${file}.lock`, "utf8")).toBe(String(process.pid));
});

it("preserves native permission errors so callers can open a read-only document", () => {
  const file = fixture();
  const denied = Object.assign(new Error("access denied"), {code: "EACCES"});
  const hook = vi.spyOn(fs, "mkdirSync").mockImplementation(() => {throw denied;});
  try { expect(() => lockProjectDocument(file)).toThrow(denied); }
  finally { hook.mockRestore(); }
});
