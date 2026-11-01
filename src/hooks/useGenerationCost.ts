import { getAccountingNotice } from "../lib/generation-accounting-notices";
import { useEffect, useState } from "react";
import { getGenerationEstimate } from "../lib/generation-pricing";
import { invoke } from "../lib/bridge";
import type {
  GenerationCostEstimate,
  GenerationCostRequest,
} from "../../shared/generation-cost";
import type { GenerationUsage } from "../../shared/generation-usage";
import type { Result } from "../../shared/result";
import type { GenerationUsageChangedDetail } from "../lib/generation-accounting";
import type { GenerationSubject } from "../lib/model-generation-accounting";

export function useGenerationCost(
  modelId: string,
  request: GenerationCostRequest,
  subject?: GenerationSubject,
) {
  const [priceRefresh, setPriceRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [estimate, setEstimate] = useState<GenerationCostEstimate | null>(null);
  const [last, setLast] = useState<GenerationUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountingWarning, setAccountingWarning] = useState<string | null>(
    null,
  );
  const requestKey = JSON.stringify(request);
  const family = request.kind === "video" ? "video" : "image";
  useEffect(() => {
    const notice = subject?.project_id ? getAccountingNotice(subject.project_id, subject.subject_id, family) : undefined;
    setAccountingWarning(notice?.warnings.length ? notice.warnings.join(" ") : null);
    const usageChanged = (event: Event) => {
      const detail = (event as CustomEvent<GenerationUsageChangedDetail>)
        .detail;
      if (
        detail?.project_id === subject?.project_id &&
        (!subject?.subject_id || detail?.subject_id === subject.subject_id) && (!detail.kind_family || detail.kind_family === family)
      ) {
        setAccountingWarning(
          detail.warnings?.length ? detail.warnings.join(" ") : null,
        );
      }
      setHistoryRefresh((value) => value + 1);
      setPriceRefresh((value) => value + 1);
    };
    const pricingChanged = () => setPriceRefresh((value) => value + 1);
    window.addEventListener("showbiz:usage-changed", usageChanged);
    window.addEventListener("showbiz:pricing-changed", pricingChanged);
    return () => {
      window.removeEventListener("showbiz:usage-changed", usageChanged);
      window.removeEventListener("showbiz:pricing-changed", pricingChanged);
    };
  }, [subject?.project_id, subject?.subject_id, family]);
  useEffect(() => {
    let stopped = false;
    setEstimate(null);
    void getGenerationEstimate(modelId, request).then((value) => {
      if (!stopped) setEstimate(value);
    });
    return () => {
      stopped = true;
    };
  }, [modelId, requestKey, priceRefresh]);
  useEffect(() => {
    let stopped = false;
    setLast(null);
    setError(null);
    if (subject?.project_id && subject.subject_id) {
      invoke<Result<{ items: GenerationUsage[] }>>("get_generation_usage", {
        project_id: subject.project_id,
        subject_id: subject.subject_id,
        kind_family: family,
        limit: 1,
      })
        .then((result) => {
          if (stopped) return;
          if (!result.ok) setError(result.error.message);
          else
            setLast(
              result.value.items.find((item) =>
                family === "video"
                  ? item.kind === "video"
                  : item.kind !== "video",
              ) ?? null,
            );
        })
        .catch(() => {
          if (!stopped) setError("The last request cost could not be loaded.");
        });
    }
    return () => {
      stopped = true;
    };
  }, [subject?.project_id, subject?.subject_id, family, historyRefresh]);
  return { estimate, last, error: [accountingWarning, error].filter(Boolean).join(" ") || null };
}
