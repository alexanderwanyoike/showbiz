import { useEffect, useState } from "react";
import { getGenerationEstimate } from "../lib/generation-pricing";
import { invoke } from "../lib/bridge";
import type {
  GenerationCostEstimate,
  GenerationCostRequest,
} from "../../shared/generation-cost";
import type { GenerationUsage } from "../../shared/generation-usage";
import type { Result } from "../../shared/result";
import type { GenerationSubject } from "../lib/model-generation-accounting";

export function useGenerationCost(
  modelId: string,
  request: GenerationCostRequest,
  subject?: GenerationSubject,
) {
  const [refresh, setRefresh] = useState(0);
  const [estimate, setEstimate] = useState<GenerationCostEstimate | null>(null);
  const [last, setLast] = useState<GenerationUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    const changed = () => setRefresh((value) => value + 1);
    window.addEventListener("showbiz:usage-changed", changed);
    window.addEventListener("showbiz:pricing-changed", changed);
    return () => {
      window.removeEventListener("showbiz:usage-changed", changed);
      window.removeEventListener("showbiz:pricing-changed", changed);
    };
  }, []);
  useEffect(() => {
    let stopped = false;
    setEstimate(null);
    void getGenerationEstimate(modelId, request).then((value) => {
      if (!stopped) setEstimate(value);
    });
    return () => { stopped = true; };
  }, [modelId, requestKey, refresh]);
  const family = request.kind === "video" ? "video" : "image";
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
          else setLast(result.value.items.find((item) => family === "video" ? item.kind === "video" : item.kind !== "video") ?? null);
        })
        .catch(() => { if (!stopped) setError("The last request cost could not be loaded."); });
    }
    return () => { stopped = true; };
  }, [subject?.project_id, subject?.subject_id, family, refresh]);
  return { estimate, last, error };
}
