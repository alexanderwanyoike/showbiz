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
    const page = await getGenerationUsage(projectId, offset);
    if (!page.ok) return page;
    const summary = await getGenerationCostSummary(projectId);
    if (!summary.ok) return summary;
    return {
      ok: true,
      value: { ...page.value, summary: summary.value, billing_notes: [] },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message:
          "Could not read recorded project usage. Existing estimates and receipts were preserved.",
      },
    };
  }
}
export async function refreshUsageCharges(
  projectId: string,
  offset: number,
  snapshot: UsageWithBilling,
  force = false,
): Promise<Result<UsageWithBilling> | null> {
  const pending = snapshot.items.filter(
    (item) =>
      item.reported_microusd === null &&
      item.provider_request_id &&
      ["fal", "openrouter"].includes(item.provider) &&
      item.status !== "running",
  );
  if (!pending.length) return null;
  let notes: GenerationBillingSync["notes"];
  try {
    const synced = await invoke<Result<GenerationBillingSync>>(
      "sync_generation_charges",
      {
        project_id: projectId,
        request_ids: pending.map((item) => item.request_id),
        ...(force ? { force: true } : {}),
      },
    );
    notes = synced.ok
      ? synced.value.notes
      : pending.map((item) => ({
          request_id: item.request_id,
          message: synced.error.message,
        }));
  } catch {
    notes = pending.map((item) => ({
      request_id: item.request_id,
      message:
        "Provider billing could not be checked. This charge remains unconfirmed.",
    }));
  }
  const updated = await loadUsageWithBilling(projectId, offset);
  return updated.ok
    ? { ok: true, value: { ...updated.value, billing_notes: notes } }
    : updated;
}
