import { describe, expect, it } from "vitest";
import {
  getAdjacentShotIds,
  getSelectedShotId,
} from "./storyboard-workspace";

const shots = [
  { id: "shot-1", order: 1 },
  { id: "shot-2", order: 2 },
  { id: "shot-3", order: 3 },
  { id: "shot-4", order: 4 },
];

describe("getSelectedShotId", () => {
  it("returns the current selected id when it still exists", () => {
    expect(getSelectedShotId(shots, "shot-3")).toBe("shot-3");
  });

  it("falls back to the first shot when selection is missing", () => {
    expect(getSelectedShotId(shots, undefined)).toBe("shot-1");
  });

  it("falls back to the first shot when selected id no longer exists", () => {
    expect(getSelectedShotId(shots, "shot-9")).toBe("shot-1");
  });

  it("returns null when there are no shots", () => {
    expect(getSelectedShotId([], undefined)).toBeNull();
  });
});

describe("getAdjacentShotIds", () => {
  it("returns previous and next neighbors around the selection", () => {
    expect(getAdjacentShotIds(shots, "shot-3")).toEqual(["shot-2", "shot-4"]);
  });

  it("returns only the next neighbor for the first shot", () => {
    expect(getAdjacentShotIds(shots, "shot-1")).toEqual(["shot-2"]);
  });

  it("returns only the previous neighbor for the last shot", () => {
    expect(getAdjacentShotIds(shots, "shot-4")).toEqual(["shot-3"]);
  });

  it("returns an empty list when the selection is unknown", () => {
    expect(getAdjacentShotIds(shots, "shot-9")).toEqual([]);
  });
});
