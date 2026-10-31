// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { applyAppearance, readAppearance, saveAppearance } from "./appearance";
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it("restores persisted choices and rejects invalid saved preferences", () => {
  expect(readAppearance()).toEqual({
    ok: true,
    value: { material: "native", accent: "native" },
  });
  expect(saveAppearance({ material: "paper", accent: "amber" }).ok).toBe(true);
  expect(readAppearance()).toEqual({
    ok: true,
    value: { material: "paper", accent: "amber" },
  });
  localStorage.setItem(
    "showbiz-appearance",
    '{"material":"missing","accent":"amber"}',
  );
  expect(readAppearance()).toMatchObject({ ok: false });
});
it("reports unavailable storage and retains the active material", () => {
  applyAppearance({ material: "native", accent: "native" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  expect(saveAppearance({ material: "slate", accent: "plum" })).toMatchObject({
    ok: false,
  });
  expect(document.documentElement.dataset.material).toBe("native");
});
