import type { GenerationKind } from "./generation-cost";

export interface GenerationUsage {
  request_id: string;
  project_id: string;
  kind: GenerationKind;
  provider: string;
  model_id: string;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  settings: Record<string, string | number | boolean>;
  estimated_min_microusd: number | null;
  estimated_max_microusd: number | null;
  price_source: string | null;
  price_checked_at: string | null;
  reported_microusd: number | null;
  provider_request_id: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface GenerationCostSummary {
  reported_microusd: number;
  estimated_min_microusd: number;
  estimated_max_microusd: number;
  unknown_count: number;
  total_count: number;
}
