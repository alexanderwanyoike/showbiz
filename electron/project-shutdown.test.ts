import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { closeProjectStorage } from "./project-shutdown";
it("retains a failed final project save while still closing device storage", () => {
  const closeDevice = vi.fn();
  expect(
    closeProjectStorage(
      () => ({
        ok: false,
        error: { code: "DOCUMENT_ERROR", message: "Project disk is full." },
      }),
      closeDevice,
    ),
  ).toMatchObject({ ok: false, error: { message: "Project disk is full." } });
  expect(closeDevice).toHaveBeenCalledOnce();
});
it("reports unexpected cleanup failures instead of dropping them during quit", () => {
  const closeDevice = vi.fn(() => {
    throw new Error("Device storage close failed.");
  });
  expect(
    closeProjectStorage(() => {
      throw new Error("Project storage close failed.");
    }, closeDevice),
  ).toMatchObject({
    ok: false,
    error: {
      message: expect.stringContaining(
        "Project storage close failed.\nDevice storage close failed.",
      ),
    },
  });
});


it("retains final-save failures in a private log readable after the packaged app exits", () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(),"showbiz-shutdown-log-"));
 const file = path.join(directory,"logs/project-storage.log");
 try {
   expect(closeProjectStorage(() => ({ok:false,error:{code:"IO_ERROR",message:"Project disk full"}}), () => {}, file)).toMatchObject({ok:false});
   expect(fs.readFileSync(file,"utf8")).toContain("Project disk full");
   if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o077).toBe(0);
 } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
