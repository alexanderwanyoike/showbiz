import { describe, it, expect } from "vitest";
import { versionsForShot, valueForShot } from "./shot-versions";

describe("versionsForShot (per-shot version isolation)", () => {
  it("returns a shot's own versions", () => {
    expect(versionsForShot({ s1: ["a"], s2: ["b"] }, "s1")).toEqual(["a"]);
    expect(versionsForShot({ s1: ["a"], s2: ["b"] }, "s2")).toEqual(["b"]);
  });

  // The bug: after adding shot 2, the panel kept showing shot 1's versions.
  // A shot with no loaded entry (e.g. a freshly created one) must read empty,
  // NEVER another shot's versions.
  it("returns [] for a shot with no entry, never another shot's versions", () => {
    expect(versionsForShot({ shot1: ["v1", "v2"] }, "shot2")).toEqual([]);
  });

  it("returns [] when no shot is selected", () => {
    expect(versionsForShot({ s1: ["a"] }, null)).toEqual([]);
  });
});

describe("valueForShot (current version / count isolation)", () => {
  it("returns the shot's value or the fallback for an unknown/unselected shot", () => {
    expect(valueForShot({ s1: 3 }, "s1", 0)).toBe(3);
    expect(valueForShot({ s1: 3 }, "s2", 0)).toBe(0);
    expect(valueForShot<number | null>({ s1: null }, "s1", null)).toBeNull();
    expect(valueForShot({ s1: 3 }, null, 0)).toBe(0);
  });
});

describe("adding a shot never inherits the previous shot's versions", () => {
  it("a newly created shot (no entry yet) reads empty while the old shot keeps its own", () => {
    const byShot: Record<string, string[]> = { shot1: ["v1", "v2"] };
    // The fix moves selection to the new shot id; it has no entry yet ->
    expect(versionsForShot(byShot, "shot2")).toEqual([]);
    expect(versionsForShot(byShot, "shot1")).toEqual(["v1", "v2"]);
  });
});
