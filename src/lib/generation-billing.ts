import { invoke } from "./bridge";
import {
  getGenerationUsage,
  getGenerationCostSummary,
} from "./generation-usage";
import type { GenerationBillingSync } from "../../shared/generation-billing";
import type {
  GenerationUsage,
  GenerationCostSummary,
} from "../../shared/generation-usage";
import type { Result } from "../../shared/result";

export interface UsageWithBilling {
  items: GenerationUsage[];
  total_count: number;
  summary: GenerationCostSummary;
  billing_notes: GenerationBillingSync["notes"];
}
export async function loadUsageWithBilling(
  projectId: string,
  offset: number,
): Promise<Result<UsageWithBilling>> {
  try {
    let page = await getGenerationUsage(projectId, offset);
    if (!page.ok) return page;
    const pending = page.value.items.filter(
      (item) =>
        item.reported_microusd === null &&
        item.provider_request_id &&
        ["fal", "openrouter"].includes(item.provider) &&
        item.status !== "running",
    );
    let notes: GenerationBillingSync["notes"] = [];
    if (pending.length) {
      const synced = await invoke<Result<GenerationBillingSync>>(
        "sync_generation_charges",
        {
          project_id: projectId,
          request_ids: pending.map((item) => item.request_id),
        },
      );
      notes = synced.ok
        ? synced.value.notes
        : pending.map((item) => ({
            request_id: item.request_id,
            message: synced.error.message,
          }));
      page = await getGenerationUsage(projectId, offset);
      if (!page.ok) return page;
    }
    const summary = await getGenerationCostSummary(projectId);
    if (!summary.ok) return summary;
    return {
      ok: true,
      value: { ...page.value, summary: summary.value, billing_notes: notes },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message:
          "Could not refresh usage and provider charges. Recorded estimates and receipts were preserved.",
      },
    };
  }
}
