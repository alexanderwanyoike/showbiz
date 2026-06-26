import { describe, expect, it } from "vitest";
import { hasCompiledPromptForGeneration, shouldClearCompiledPrompt } from "./compile-review";

describe("compile review", () => {
  it("requires non-empty compiled prompt text before generation", () => {
    expect(hasCompiledPromptForGeneration(null)).toBe(false);
    expect(hasCompiledPromptForGeneration("   ")).toBe(false);
    expect(hasCompiledPromptForGeneration("Action: Alex sits at a desk")).toBe(true);
  });

  it("clears compiled prompt when shot intent fields change", () => {
    expect(shouldClearCompiledPrompt({ intent_action: "walks forward" })).toBe(true);
    expect(shouldClearCompiledPrompt({ intent_camera: "slow push-in" })).toBe(true);
    expect(shouldClearCompiledPrompt({ intent_mood: "focused" })).toBe(true);
    expect(shouldClearCompiledPrompt({ video_prompt: "walks forward" })).toBe(true);
  });

  it("does not clear compiled prompt for non-prompt updates", () => {
    expect(shouldClearCompiledPrompt({})).toBe(false);
  });
});
