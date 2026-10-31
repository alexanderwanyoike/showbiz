import { loadUsageWithBilling, type UsageWithBilling } from "../lib/generation-billing";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { WorkspaceToolbar } from "../components/WorkspaceToolbar";
import { Button } from "@/components/ui/button";
import { useAgentChanges } from "../hooks/useAgentChanges";
import {
  formatGenerationCost,
  formatGenerationEstimate,
} from "../lib/generation-usage";
import type {
  GenerationUsage,
} from "../../shared/generation-usage";
import "../usage.css";

function charge(item: GenerationUsage) {
  if (item.reported_microusd !== null)
    return `${formatGenerationCost(item.reported_microusd)} reported`;
  if (
    item.estimated_min_microusd !== null &&
    item.estimated_max_microusd !== null
  )
    return `~${formatGenerationEstimate(item.estimated_min_microusd, item.estimated_max_microusd)} estimated`;
  return "Unknown";
}
export default function UsagePage() {
  const { id } = useParams();
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<UsageWithBilling | null>(null);
  const [error, setError] = useState<string | null>(null);
  useAgentChanges(() => setRefresh((value) => value + 1));
  useEffect(() => {
    let stopped = false;
    setData(null);
    setError(null);
    if (id)
      loadUsageWithBilling(id, offset)
        .then((result) => {
          if (stopped) return;
          if (!result.ok) setError(result.error.message);
          else setData(result.value);
        })
        .catch((cause: unknown) => {
          if (!stopped) setError(String(cause));
        });
    return () => {
      stopped = true;
    };
  }, [id, offset, refresh]);
  return (
    <section className="usage-workspace" aria-label="Usage & billing">
      <WorkspaceToolbar title="Usage & billing">
        <Button
          variant="outline"
          size="sm"
          disabled={!data && !error}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {!data && !error ? "Checking charges…" : "Refresh charges"}
        </Button>
      </WorkspaceToolbar>
      <div className="usage-content">
        {error && <p role="alert">{error}</p>}
        {!error && !data && <p role="status">Loading usage…</p>}
        {data && (
          <>
            <div className="usage-totals">
              <div>
                <span>Reported charges</span>
                <strong>
                  {formatGenerationCost(data.summary.reported_microusd)}
                </strong>
              </div>
              <div>
                <span>Estimated, unconfirmed</span>
                <strong>
                  ~
                  {formatGenerationEstimate(
                    data.summary.estimated_min_microusd,
                    data.summary.estimated_max_microusd,
                  )}
                </strong>
              </div>
              <div>
                <span>
                  {data.summary.unknown_count} unknown{" "}
                  {data.summary.unknown_count === 1 ? "charge" : "charges"}
                </span>
                <strong>{data.summary.total_count} requests</strong>
              </div>
            </div>
            <p className="usage-explanation">
              Only generations recorded in this project are included. Reported charges come from provider receipts; estimates are unconfirmed and may differ from invoices.
            </p>
            <details className="usage-explanation">
              <summary>How costs are recorded</summary>
              <p>USD. Unknown charges are not counted as free. Refresh checks the requests on this page; totals are not your provider account balance. Gemini estimates use published rates; its generation API does not return a monetary receipt. Local compute estimates use your saved rate; hardware and electricity costs are otherwise unknown.</p>
            </details>
            {data.items.length ? (
              <div className="usage-table-scroll">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Generation</th>
                      <th>Provider / model</th>
                      <th>Outcome</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.request_id}>
                        <td>{new Date(item.started_at).toLocaleString()}</td>
                        <td>{item.kind.replaceAll("_", " ")}</td>
                        <td>
                          <strong>{item.provider}</strong>
                          <span>{item.model_id}</span>
                        </td>
                        <td>{item.status}</td>
                        <td>
                          <strong>{charge(item)}</strong>
                          {data.billing_notes.filter((note) => note.request_id === item.request_id).map((note) => <details key={note.message}><summary>Charge unconfirmed</summary><p>{note.message}</p></details>)}
                          {item.provider_request_id && <span className="select-text break-all">Request: {item.provider_request_id}</span>}
                          {item.estimated_min_microusd !== null &&
                            item.reported_microusd !== null && (
                              <span>
                                Preflight ~
                                {formatGenerationEstimate(
                                  item.estimated_min_microusd,
                                  item.estimated_max_microusd ??
                                    item.estimated_min_microusd,
                                )}
                              </span>
                            )}
                          {item.price_checked_at && (
                            <span>
                              Rate checked{" "}
                              {new Date(
                                item.price_checked_at,
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No generations recorded yet.</p>
            )}
            <div className="usage-pagination">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 50))}
              >
                Previous
              </Button>
              <span>
                {data.total_count
                  ? `${offset + 1} to ${Math.min(offset + 50, data.total_count)} of ${data.total_count}`
                  : "0 requests"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + 50 >= data.total_count}
                onClick={() => setOffset((value) => value + 50)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
