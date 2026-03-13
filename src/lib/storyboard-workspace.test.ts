import { describe, expect, it } from "vitest";
import {
  getAdjacentShotIds,
  getSelectedShotId,
} from "./storyboard-workspace";

const shots = [
  { id: "shot-1", order: 1 },
  { id: "shot-2", order: 2 },
  { id: "shot-3", order: 3 },
];

describe("getSelectedShotId", () => {
  it("keeps a valid selected shot", () => {
    expect(getSelectedShotId(shots, "shot-2")).toBe("shot-2");
  });

  it("falls back to the first shot", () => {
    expect(getSelectedShotId(shots, "missing")).toBe("shot-1");
  });

  it("returns null for an empty storyboard", () => {
    expect(getSelectedShotId([], undefined)).toBeNull();
  });
});

describe("getAdjacentShotIds", () => {
  it("returns neighboring shot ids", () => {
    expect(getAdjacentShotIds(shots, "shot-2")).toEqual(["shot-1", "shot-3"]);
  });
});
