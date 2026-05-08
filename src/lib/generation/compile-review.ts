export interface PromptAffectingShotUpdates {
  video_prompt?: string | null;
  intent_action?: string | null;
  intent_camera?: string | null;
  intent_mood?: string | null;
}

export function hasCompiledPromptForGeneration(compiledPrompt: string | null | undefined): boolean {
  return Boolean(compiledPrompt?.trim());
}

export function shouldClearCompiledPrompt(updates: PromptAffectingShotUpdates): boolean {
  return (
    updates.video_prompt !== undefined ||
    updates.intent_action !== undefined ||
    updates.intent_camera !== undefined ||
    updates.intent_mood !== undefined
  );
}
