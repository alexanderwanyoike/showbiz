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
