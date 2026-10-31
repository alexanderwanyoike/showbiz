import { invoke } from "./bridge";
import type {
  GenerationUsage,
  GenerationCostSummary,
} from "../../shared/generation-usage";
import type { Result } from "../../shared/result";

export const getGenerationUsage = (projectId: string, offset = 0) =>
  invoke<Result<{ items: GenerationUsage[]; total_count: number }>>(
    "get_generation_usage",
    { project_id: projectId, offset, limit: 50 },
  );
export const getGenerationCostSummary = (projectId: string) =>
  invoke<Result<GenerationCostSummary>>("get_generation_cost_summary", {
    project_id: projectId,
  });
export function formatGenerationCost(microusd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(microusd / 1000000);
}
export function formatGenerationEstimate(min: number, max: number): string {
  return min === max
    ? formatGenerationCost(min)
    : `${formatGenerationCost(min)} to ${formatGenerationCost(max)}`;
}
