export type GenerationRunMap = Record<string, number>;

export function startGenerationRun(runs: GenerationRunMap, shotId: string): number {
  const nextRunId = (runs[shotId] ?? 0) + 1;
  runs[shotId] = nextRunId;
  return nextRunId;
}

export function invalidateGenerationRun(runs: GenerationRunMap, shotId: string): number {
  return startGenerationRun(runs, shotId);
}

export function isCurrentGenerationRun(
  runs: GenerationRunMap,
  shotId: string,
  runId: number
): boolean {
  return runs[shotId] === runId;
}
