import type { CompiledShotPrompt, GenerationReference, ShotPromptInput } from "./types";

function withAliases(references: GenerationReference[]): GenerationReference[] {
  let imageIndex = 0;
  return references.map((reference) => {
    if (reference.mediaType !== "image") return reference;
    imageIndex += 1;
    return { ...reference, promptAlias: `@Image${imageIndex}` };
  });
}

function referenceLine(reference: GenerationReference): string {
  const aliasPrefix = reference.promptAlias ? `${reference.promptAlias} is ` : "";
  const details = [reference.description, reference.variantPrompt, reference.rules].filter(Boolean).join(" ");
  return `${aliasPrefix}${reference.label}${details ? `: ${details}` : ""}`;
}

export function compileShotPrompt(input: ShotPromptInput): CompiledShotPrompt {
  const references = input.includeAliases ? withAliases(input.references) : [...input.references];
  const override = input.promptOverride?.trim();

  if (override) {
    return { prompt: override, references };
  }

  const sections = [
    references.length > 0
      ? references.map(referenceLine).join("\n")
      : null,
    input.action.trim() ? `Action: ${input.action.trim()}` : null,
    input.camera?.trim() ? `Camera: ${input.camera.trim()}` : null,
    input.mood?.trim() ? `Mood: ${input.mood.trim()}` : null,
  ].filter(Boolean);

  return { prompt: sections.join("\n\n"), references };
}
