// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  ACCENTS,
  applyAppearance,
  readAppearance,
  saveAppearance,
} from "./appearance";
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

it("offers saturated accents with readable button text in both appearance modes", () => {
  for (const accent of ACCENTS) {
    for (const mode of ["light", "dark"] as const) {
      const { background, foreground } = accent[mode];
      const rgb = (hex: string) =>
        [1, 3, 5].map(
          (index) => parseInt(hex.slice(index, index + 2), 16) / 255,
        );
      const channels = rgb(background);
      const max = Math.max(...channels);
      const min = Math.min(...channels);
      const lightness = (max + min) / 2;
      const saturation = (max - min) / (1 - Math.abs(2 * lightness - 1));
      expect(saturation, `${accent.id} ${mode} saturation`).toBeGreaterThan(
        0.65,
      );
      const luminance = (hex: string) =>
        rgb(hex)
          .map((value) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
          )
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const a = luminance(background);
      const b = luminance(foreground);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        `${accent.id} ${mode} text contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  applyAppearance({ material: "aluminium", accent: "cobalt" });
  expect(
    document.documentElement.style.getPropertyValue("--chosen-accent-light"),
  ).toBe(ACCENTS[1].light.background);
  expect(
    document.documentElement.style.getPropertyValue("--chosen-accent-dark"),
  ).toBe(ACCENTS[1].dark.background);
});
