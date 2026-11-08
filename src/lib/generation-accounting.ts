import { retainAccountingNotice } from "./generation-accounting-notices";
import { invoke } from "./bridge";
import type { GenerationCostEstimate } from "../../shared/generation-cost";
import type { GenerationObserver } from "../../shared/generation-output";
import type { GenerationBillingSync } from "../../shared/generation-billing";
import type { GenerationUsage } from "../../shared/generation-usage";
import type { Result } from "../../shared/result";

export type GenerationAccountingResult<T> = Result<T> & { warnings?: string[] };

export type GenerationAccountingRequest = Pick<
  GenerationUsage,
  "project_id" | "provider" | "model_id" | "kind" | "settings"
> & { subject_id?: string };
const failed = (message: string): Result<never> => ({
  ok: false,
  error: { code: "IO_ERROR", message },
});
export interface GenerationUsageChangedDetail {
  project_id: string;
  subject_id?: string;
  warnings: string[];
  request_id: string;
  started: boolean;
  kind_family?: "image" | "video";
}
function notify(
  request: GenerationAccountingRequest,
  requestId: string,
  warnings: string[] = [],
  started = false,
) {
  retainAccountingNotice({
    ...request,
    request_id: requestId,
    warnings,
    started,
    kind_family: request.kind === "video" ? "video" : "image",
  });
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<GenerationUsageChangedDetail>("showbiz:usage-changed", {
        detail: {
          project_id: request.project_id,
          subject_id: request.subject_id,
          warnings: [...warnings],
          request_id: requestId,
          started,
          kind_family: request.kind === "video" ? "video" : "image",
        },
      }),
    );
}
/** Identifies a generation an agent job submitted, so retries can never start a second provider request. */
export interface AgentGenerationIdentity {
  request_id: string;
  agent_job_id: string;
}
export async function runAccountedGeneration<T>(
  request: GenerationAccountingRequest,
  estimate: GenerationCostEstimate,
  operation: (observer: GenerationObserver) => Promise<T>,
  agent?: AgentGenerationIdentity,
): Promise<GenerationAccountingResult<T>> {
  const request_id = agent?.request_id ?? crypto.randomUUID();
  try {
    const begun = await invoke<Result<GenerationUsage>>(
      "begin_generation_usage",
      {
        ...request,
        request_id,
        ...(agent ? { agent_job_id: agent.agent_job_id } : {}),
        ...(estimate.kind === "estimate"
          ? {
              estimated_min_microusd: estimate.min_microusd,
              estimated_max_microusd: estimate.max_microusd,
              price_basis: estimate.price,
            }
          : {}),
      },
    );
    if (!begun.ok) return begun;
    notify(request, request_id, [], true);
    const warnings: string[] = [];
    let result: Result<T>;
    let pendingReceipt = false;
    try {
      const value = await operation({
        receipt: async (receipt) => {
          if (
            receipt.reported_microusd === null &&
            receipt.provider_request_id === null
          )
            return;
          pendingReceipt =
            receipt.provider_request_id !== null &&
            receipt.reported_microusd === null;
          try {
            const recorded = await invoke<Result<null>>(
              "record_generation_receipt",
              { request_id, ...receipt },
            );
            if (!recorded.ok)
              warnings.push(
                `Could not save the provider receipt: ${recorded.error.message}`,
              );
          } catch (cause) {
            warnings.push(
              `Could not save the provider receipt: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
          }
          notify(request, request_id, warnings);
        },
      });
      result = { ok: true, value };
    } catch (cause) {
      result = failed(cause instanceof Error ? cause.message : String(cause));
    }
    let finishSucceeded = false;
    try {
      const finished = await invoke<Result<null>>("finish_generation_usage", {
        request_id,
        status: result.ok ? "completed" : "failed",
      });
      finishSucceeded = finished.ok;
      if (!finished.ok)
        warnings.push(
          `The usage outcome could not be saved: ${finished.error.message}`,
        );
    } catch (cause) {
      warnings.push(
        `The usage outcome could not be saved: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    if (
      finishSucceeded &&
      pendingReceipt &&
      ["fal", "openrouter"].includes(request.provider)
    ) {
      void invoke<Result<GenerationBillingSync>>("sync_generation_charges", {
        project_id: request.project_id,
        request_ids: [request_id],
      })
        .then((reconciled) => {
          const messages = reconciled.ok
            ? reconciled.value.notes
                .filter((note) => note.kind !== "pending")
                .map((note) => note.message)
            : [reconciled.error.message];
          notify(request, request_id, [...warnings, ...messages]);
        })
        .catch(() => {
          notify(request, request_id, [
            ...warnings,
            "Provider billing could not be checked. The charge remains unconfirmed.",
          ]);
        });
    }
    notify(request, request_id, warnings);
    return warnings.length ? { ...result, warnings } : result;
  } catch (cause) {
    return failed(
      cause instanceof Error
        ? cause.message
        : "Could not record generation usage.",
    );
  }
}
