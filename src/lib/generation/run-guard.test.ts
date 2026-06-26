import { describe, expect, it } from "vitest";
import {
  invalidateGenerationRun,
  isCurrentGenerationRun,
  startGenerationRun,
  type GenerationRunMap,
} from "./run-guard";

describe("generation run guard", () => {
  it("marks only the latest run for a shot as current", () => {
    const runs: GenerationRunMap = {};

    const firstRun = startGenerationRun(runs, "shot-1");
    const secondRun = startGenerationRun(runs, "shot-1");

    expect(isCurrentGenerationRun(runs, "shot-1", firstRun)).toBe(false);
    expect(isCurrentGenerationRun(runs, "shot-1", secondRun)).toBe(true);
  });

  it("invalidates an in-flight run when local waiting is stopped", () => {
    const runs: GenerationRunMap = {};

    const activeRun = startGenerationRun(runs, "shot-1");
    invalidateGenerationRun(runs, "shot-1");

    expect(isCurrentGenerationRun(runs, "shot-1", activeRun)).toBe(false);
  });
});
