import { hasUnknownHistoricalPrice, unknownHistoricalPriceReason } from "../../shared/generation-cost";
import { API_KEY_PROVIDERS } from "../../shared/provider-catalog";
import type { GenerationUsage } from "../../shared/generation-usage";
import { ModelPricingDialog } from "./ModelPricingDialog";
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

const outcomeLabels: Record<GenerationUsage["status"], string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
const operationLabels: Record<GenerationUsage["kind"], string> = {
  image: "Image generation",
  image_edit: "Image edit",
  image_compose: "Image composition",
  video: "Video generation",
};

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
  const { estimate: quotedEstimate, last, error } = useGenerationCost(
    modelId,
    request,
    subject,
  );
  const estimate = quotedEstimate?.kind === "estimate" && hasUnknownHistoricalPrice(quotedEstimate.price) ? { kind: "unavailable" as const, reason: unknownHistoricalPriceReason } : quotedEstimate;
  const models = [...getAvailableImageModels(), ...getAvailableVideoModels()];
  const model = models.find((entry) => entry.id === modelId);
  const lastModel = models.find(
    (entry) =>
      entry.id === last?.model_id && entry.apiKeyProvider === last?.provider,
  );
  const lastProvider =
    API_KEY_PROVIDERS.find((entry) => entry.id === last?.provider)?.name ??
    last?.provider ??
    "Unknown provider";
  const provider = model?.apiKeyProvider;
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
            ? `Estimated${estimate.price.estimate_basis === "historical_request" ? " (provider history)" : ""} ~${formatGenerationEstimate(estimate.min_microusd, estimate.max_microusd)}`
            : modelId.startsWith("local-")
              ? "Local running cost not estimated"
              : "Estimate unavailable"}
      </output>
      {estimate?.kind === "estimate" && estimate.stale && (
        <p role="status" className="text-muted-foreground">
          {estimate.price.source_kind === "published"
            ? "Published price snapshot may be out of date."
            : estimate.price.source_kind === "manual"
              ? "Your saved rate may be out of date."
              : "Using an older cached price. Live pricing is unconfirmed."}
        </p>
      )}
      {previous && (
        <output
          aria-label="Last generation cost"
          className="block text-muted-foreground tabular-nums"
        >
          Last request: {previous}
        </output>
      )}
      {last && (
        <p
          aria-label="Last request details"
          className="break-words text-muted-foreground"
        >
          <span>{operationLabels[last.kind]}</span> ·{" "}
          <span>{lastModel?.name ?? last.model_id}</span> ·{" "}
          <span>{lastProvider}</span> ·{" "}
          <span>{outcomeLabels[last.status]}</span>
        </p>
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
                {estimate.price.source_kind === "manual" ? (
                  "Your saved rate"
                ) : estimate.price.source_kind === "published" ? (
                  <span>Published price snapshot</span>
                ) : estimate.price_freshness === "live" ? (
                  "Live provider API pricing"
                ) : estimate.price_freshness === "stale" ? (
                  "Cached provider API pricing (refresh unavailable)"
                ) : (
                  "Cached provider API pricing"
                )}{" "}
                · {estimate.price.provider} · USD
              </p>
              <p className="break-all select-text">
                {estimate.price.source_url || "Entered on this device"}
              </p>
              <p>
                {estimate.price.source_kind === "manual"
                  ? "Saved"
                  : estimate.price.source_kind === "published"
                    ? "Snapshot dated"
                    : "Retrieved"}{" "}
                {new Date(estimate.price.checked_at).toLocaleString()}
                {estimate.stale ? ". This rate may be out of date." : ""}
              </p>
              {estimate.price.source_kind === "published" && (
                <p>
                  This published rate is not a live pricing API response or a
                  confirmed charge.
                </p>
              )}
              {estimate.price.estimate_basis === "historical_request" && (
                <p>
                  Historical cost per request from the provider. This estimate
                  is not adjusted for duration, resolution, audio or input
                  media.
                </p>
              )}
              {estimate.price.estimate_basis === "historical_request" &&
                estimate.max_microusd === 0 && (
                  <p>
                    The provider returned a zero historical estimate. This does
                    not confirm that a new request is free.
                  </p>
                )}
              {estimate.price.billing_unit &&
                estimate.price.billing_unit_microusd !== undefined && (
                  <p>
                    Current API unit rate:{" "}
                    {formatGenerationCost(estimate.price.billing_unit_microusd)}{" "}
                    per {estimate.price.billing_unit}. Billable quantity can
                    vary.
                  </p>
                )}
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
        <ModelPricingDialog
          modelId={modelId}
          modelName={model?.name ?? modelId}
          provider={provider}
          request={request}
          price={estimate?.kind === "estimate" ? estimate.price : undefined}
        />
      )}
    </div>
  );
}
