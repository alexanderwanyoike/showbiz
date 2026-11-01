import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  createProjectFileOpening,
  projectFileArguments,
} from "./project-file-opening";
it("retains early OS open events and serializes opening after the application is ready", async () => {
  const opened: string[] = [];
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const report = vi.fn();
  const files = createProjectFileOpening(report);
  files.add("/Films/First.showbiz");
  files.add("/Films/Second.showbiz");
  files.ready(async (file) => {
    opened.push(file);
    if (opened.length === 1) await pending;
    return { ok: true, value: null };
  });
  await Promise.resolve();
  expect(opened).toEqual(["/Films/First.showbiz"]);
  finish!();
  await files.flush();
  expect(opened).toEqual(["/Films/First.showbiz", "/Films/Second.showbiz"]);
  expect(report).not.toHaveBeenCalled();
});
it("reports failed OS opens and keeps later opens usable", async () => {
  const report = vi.fn();
  const files = createProjectFileOpening(report);
  const open = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      error: { code: "BUSY", message: "Finish unsaved edits first." },
    })
    .mockResolvedValueOnce({ ok: true, value: null });
  files.ready(open);
  files.add("/Films/First.showbiz");
  files.add("/Films/Second.showbiz");
  await files.flush();
  expect(report).toHaveBeenCalledWith(
    "/Films/First.showbiz",
    "Finish unsaved edits first.",
  );
  expect(open).toHaveBeenCalledTimes(2);
});
it("selects project paths from command line arguments without treating flags or other files as documents", () => {
  expect(
    projectFileArguments([
      "--inspect",
      "--user-data-dir=/tmp/Ignore.showbiz",
      "/Films/A Film.SHOWBIZ",
      "notes.txt",
      "relative.showbiz",
    ]),
  ).toEqual([
    path.resolve("/Films/A Film.SHOWBIZ"),
    path.resolve("relative.showbiz"),
  ]);
});

it("accepts file URLs passed by Linux desktop launchers", async () => {
  const { pathToFileURL } = await import("node:url");
  const file = path.resolve("A film with spaces.showbiz");
  expect(
    projectFileArguments([
      pathToFileURL(file).href,
      "https://example.test/Film.showbiz",
    ]),
  ).toEqual([file]);
});
