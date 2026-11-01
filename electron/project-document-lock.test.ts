import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, it, vi} from "vitest";
import {lockProjectDocument} from "./project-document-lock";
import {createProcessOwner} from "./process-owner";

it("allows only one owner when two contenders reclaim the same dead lock", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-lock-race-"));
  const file = path.join(directory, "Film.showbiz");
  const lock = `${file}.lock`;
  fs.writeFileSync(lock, JSON.stringify({...createProcessOwner(), identity: "previous-incarnation"}));
  const unlink = fs.unlinkSync;
  let competingOwner = false;
  let competingError = "";
  let attempt = true;
  const hook = vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
    if (target === lock && attempt) {
      attempt = false;
      try { lockProjectDocument(file); competingOwner = true; }
      catch (cause) { competingError = cause instanceof Error ? cause.message : String(cause); }
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
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
