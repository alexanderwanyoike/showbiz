import { GenerationRateEditor } from "./GenerationRateEditor";
import {
  getAvailableImageModels,
  getAvailableVideoModels,
} from "../lib/models";
import { useGenerationCost } from "../hooks/useGenerationCost";
import {
  formatGenerationCost,
  formatGenerationEstimate,
} from "../lib/generation-usage";
import type { GenerationCostRequest } from "../../shared/generation-cost";
import type { GenerationSubject } from "../lib/model-generation-accounting";

export interface GenerationCostProps {
  modelId: string;
  request: GenerationCostRequest;
  subject?: GenerationSubject;
}
export function GenerationCost({
  modelId,
  request,
  subject,
}: GenerationCostProps) {
  const { estimate, last, error } = useGenerationCost(
    modelId,
    request,
    subject,
  );
  const provider = [
    ...getAvailableImageModels(),
    ...getAvailableVideoModels(),
  ].find((model) => model.id === modelId)?.apiKeyProvider;
  let previous = last ? "Final charge unknown" : null;
  if (last?.reported_microusd != null)
    previous = `${formatGenerationCost(last.reported_microusd)} reported`;
  else if (
    last?.estimated_min_microusd != null &&
    last.estimated_max_microusd != null
  )
    previous = `~${formatGenerationEstimate(last.estimated_min_microusd, last.estimated_max_microusd)} estimated, unconfirmed`;
  return (
    <div
      className="space-y-1.5 py-2 text-[11px] leading-relaxed"
      aria-label="Generation cost"
    >
      <output
        aria-label="Estimated generation cost"
        className="block font-medium tabular-nums"
      >
        {!estimate
          ? "Estimating cost…"
          : estimate.kind === "estimate"
            ? `Estimated ~${formatGenerationEstimate(estimate.min_microusd, estimate.max_microusd)}`
            : modelId.startsWith("local-")
              ? "Local running cost not estimated"
              : "Estimate unavailable"}
      </output>
      {previous && (
        <output
          aria-label="Last generation cost"
          className="block text-muted-foreground tabular-nums"
        >
          Last: {previous}
          {last?.status === "failed" || last?.status === "interrupted"
            ? ` (${last.status})`
            : ""}
        </output>
      )}
      {error && (
        <p role="status" className="text-muted-foreground">
          {error}
        </p>
      )}
      {estimate && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">Rate details</summary>
          {estimate.kind === "unavailable" ? (
            <p className="mt-1">{estimate.reason}</p>
          ) : (
            <div className="mt-1 space-y-1">
              <p>
                {estimate.price.source_kind === "manual"
                  ? "Your saved rate"
                  : "Provider output rate"}{" "}
                · {estimate.price.provider} · USD
              </p>
              <p className="break-all select-text">
                {estimate.price.source_url || "Entered on this device"}
              </p>
              <p>
                {estimate.price.source_kind === "manual" ? "Saved" : "Checked"}{" "}
                {new Date(estimate.price.checked_at).toLocaleDateString()}
                {estimate.stale ? ". Rate is older than 7 days." : ""}
              </p>
              {estimate.excludes_input_cost && (
                <p>Excludes input and other provider charges.</p>
              )}
              <p>
                Approximate cost. Output dimensions and provider billing can
                change the final amount.
              </p>
            </div>
          )}
        </details>
      )}
      {provider && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">Set your rate</summary>
          <GenerationRateEditor
            key={`${modelId}:${request.kind}:${request.resolution ?? ""}:${String(request.audio)}`}
            modelId={modelId}
            provider={provider}
            request={request}
            price={estimate?.kind === "estimate" ? estimate.price : undefined}
          />
        </details>
      )}
    </div>
  );
}
