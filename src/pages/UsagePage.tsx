import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { CircleHelp, ListChecks, RefreshCw } from 'lucide-react';
import { WorkspaceToolbar } from '../components/WorkspaceToolbar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAgentChanges } from '../hooks/useAgentChanges';
import { loadUsageWithBilling, type UsageWithBilling } from '../lib/generation-billing';
import { formatGenerationCost, formatGenerationEstimate } from '../lib/generation-usage';
import { usageCharge, usageIdentity, usageKindName, usageOutcomeName } from '../lib/usage-presentation';
import type { GenerationUsage } from '../../shared/generation-usage';
import { UsageRequestDetails } from './UsageRequestDetails';
import '../usage.css';

export default function UsagePage() {
  const { id } = useParams();
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<UsageWithBilling | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GenerationUsage | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  useAgentChanges(() => setRefresh((value) => value + 1));
  useEffect(() => {
    let stopped = false;
    setData(null);
    setError(null);
    setSelected(null);
    if (id) loadUsageWithBilling(id, offset).then((result) => {
      if (stopped) return;
      if (!result.ok) setError(result.error.message);
      else setData(result.value);
    }).catch((cause: unknown) => { if (!stopped) setError(String(cause)); });
    else setError('Open a project to view its usage.');
    return () => { stopped = true; };
  }, [id, offset, refresh]);
  const loading = !data && !error;
  return <section className="usage-workspace" aria-label="Usage & billing">
    <WorkspaceToolbar title="Usage & billing">
      <span className="usage-toolbar-scope">This project · USD</span>
      <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}><CircleHelp size={15} />How costs are recorded</Button>
      <Button variant="ghost" size="sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
        <RefreshCw size={15} className={loading ? 'usage-refreshing' : undefined} />
        {loading ? 'Checking charges…' : 'Refresh charges'}
      </Button>
    </WorkspaceToolbar>
    <div className="usage-content">
      <div className="usage-ledger-panel">
        <div className="usage-ledger-heading"><h2>Project requests</h2><span>Only generations recorded in this project are included.</span></div>
        {data && <dl className="usage-totals" aria-label="Project cost totals">
          <div><dt>Reported charges</dt><dd>{formatGenerationCost(data.summary.reported_microusd)}</dd></div>
          <div><dt>Estimated, unconfirmed</dt><dd>~{formatGenerationEstimate(data.summary.estimated_min_microusd, data.summary.estimated_max_microusd)}</dd></div>
          <div><dt>Unknown charges</dt><dd>{data.summary.unknown_count} unknown {data.summary.unknown_count === 1 ? 'charge' : 'charges'}</dd></div>
        </dl>}
        <div className="usage-table-scroll" aria-label="Generation request ledger" tabIndex={0}>
          {error && <div className="usage-state"><p role="alert">{error}</p><Button variant="secondary" size="sm" onClick={() => setRefresh((value) => value + 1)}>Retry usage</Button></div>}
          {loading && <div className="usage-state" role="status">Checking recorded requests and provider charges…</div>}
          {data && (data.items.length ? <table className="usage-table">
            <caption className="sr-only">Generation requests recorded in this project. Charges in USD.</caption>
            <thead><tr><th scope="col">Started</th><th scope="col">Generation</th><th scope="col">Provider</th><th scope="col">Model</th><th scope="col">Outcome</th><th scope="col">Cost</th><th scope="col"><span className="sr-only">Request details</span></th></tr></thead>
            <tbody>{data.items.map((item) => {
              const identity = usageIdentity(item);
              const hasNote = data.billing_notes.some((note) => note.request_id === item.request_id);
              return <tr key={item.request_id}>
                <td><time dateTime={item.started_at}>{new Date(item.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} <span>{new Date(item.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></time></td>
                <td>{usageKindName[item.kind]}</td><td>{identity.provider}</td><td>{identity.model}</td>
                <td><span className="usage-outcome" data-outcome={item.status}>{usageOutcomeName[item.status]}</span></td>
                <td className="usage-charge"><span>{usageCharge(item)}</span>{hasNote && <span className="usage-unconfirmed">Charge unconfirmed</span>}</td>
                <td><Button variant="ghost" size="sm" aria-label="View request details" onClick={() => setSelected(item)}>Details</Button></td>
              </tr>;
            })}</tbody>
          </table> : <div className="usage-state"><ListChecks size={30} /><h3>No generations recorded yet.</h3><p>Image and video requests will appear here after you generate in this project.</p></div>)}
        </div>
        <footer className="usage-pagination" aria-label="Request pagination">
          <span>{data ? data.total_count ? `${offset + 1} to ${Math.min(offset + data.items.length, data.total_count)} of ${data.total_count} requests` : '0 requests' : 'Project requests'}</span>
          <Button variant="ghost" size="sm" disabled={loading || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Previous</Button>
          <Button variant="ghost" size="sm" disabled={!data || offset + 50 >= data.total_count} onClick={() => setOffset((value) => value + 50)}>Next</Button>
        </footer>
      </div>
    </div>
    <UsageRequestDetails item={selected} notes={data?.billing_notes.filter((note) => note.request_id === selected?.request_id).map((note) => note.message) ?? []} onClose={() => setSelected(null)} />
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="usage-help"><DialogHeader><DialogTitle>How costs are recorded</DialogTitle><DialogDescription>Only generations recorded in this project are included. Amounts are in USD.</DialogDescription></DialogHeader>
      <dl><dt>Reported charges</dt><dd>Charges returned by provider receipts, including a genuine reported zero.</dd><dt>Estimated, unconfirmed</dt><dd>Recorded preflight estimates for requests without confirmed charges. These may differ from invoices.</dd><dt>Unknown charges</dt><dd>Requests with neither a price estimate nor a reported charge. Unknown charges are not counted as free.</dd><dt>Refresh charges</dt><dd>Checks requests on the current page without generating media. Totals cover this project's recorded requests, not your provider account balance or all account activity.</dd></dl>
      <p>Gemini estimates use published rates; its generation API does not return a monetary receipt. Local compute estimates use your saved rate; hardware and electricity costs are otherwise unknown.</p>
      <p>Open a request's Details to inspect receipt IDs, price sources and any reason a charge remains unconfirmed.</p>
    </DialogContent></Dialog>
  </section>;
}
