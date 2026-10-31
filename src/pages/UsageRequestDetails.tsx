import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { GenerationUsage } from '../../shared/generation-usage';
import { formatGenerationEstimate } from '../lib/generation-usage';
import { usageCharge, usageIdentity, usageKindName, usageOutcomeName } from '../lib/usage-presentation';

export function UsageRequestDetails({ item, notes, onClose }: {
  item: GenerationUsage | null; notes: string[]; onClose: () => void;
}) {
  if (!item) return null;
  const identity = usageIdentity(item);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="usage-request-details">
      <DialogHeader>
        <DialogTitle>Request details</DialogTitle>
        <DialogDescription>{usageKindName[item.kind]} · {identity.model} · {identity.provider}</DialogDescription>
      </DialogHeader>
      <div className="usage-detail-body">
        <div className="usage-detail-charge">
          <strong>{usageCharge(item)}</strong>
          <span>{usageOutcomeName[item.status]}</span>
        </div>
        {item.reported_microusd === null && <section className="usage-detail-notice" aria-label="Charge unconfirmed">
          <h3>Charge unconfirmed</h3>
          {notes.length ? notes.map((note) => <p key={note}>{note}</p>) : <p>No provider receipt has been recorded. Any estimate remains unconfirmed.</p>}
        </section>}
        <dl className="usage-detail-fields">
          <dt>Started</dt><dd>{new Date(item.started_at).toLocaleString()}</dd>
          <dt>Finished</dt><dd>{item.finished_at ? new Date(item.finished_at).toLocaleString() : 'Not recorded'}</dd>
          <dt>Preflight estimate</dt><dd>{item.estimated_min_microusd !== null && item.estimated_max_microusd !== null
            ? `~${formatGenerationEstimate(item.estimated_min_microusd, item.estimated_max_microusd)}` : 'Unavailable'}</dd>
          <dt>Provider request / job ID</dt><dd><code>{item.provider_request_id ?? 'Not returned'}</code></dd>
          <dt>Showbiz request ID</dt><dd><code>{item.request_id}</code></dd>
          <dt>Provider ID</dt><dd><code>{item.provider}</code></dd>
          <dt>Model ID</dt><dd><code>{item.model_id}</code></dd>
          {item.subject_id && <><dt>Shot / asset ID</dt><dd><code>{item.subject_id}</code></dd></>}
          <dt>Price basis</dt><dd>{item.price_basis?.source_kind === 'manual' ? 'Custom device rate' : item.price_basis?.source_kind === 'published' ? 'Published price snapshot' : item.price_source ? 'Provider pricing' : 'Unavailable'}</dd>
          {item.price_basis?.estimate_basis === 'historical_request' && <><dt>Estimate basis</dt><dd>Provider request history, not adjusted to this request's settings.</dd></>}
          {item.price_source && <><dt>Price source</dt><dd className="select-text">{item.price_source}</dd></>}
          {item.price_checked_at && <><dt>Rate checked</dt><dd>{new Date(item.price_checked_at).toLocaleString()}</dd></>}
        </dl>
        {item.settings && Object.keys(item.settings).length > 0 && <details className="usage-recorded-settings">
          <summary>Recorded request settings</summary>
          <pre>{JSON.stringify(item.settings, null, 2)}</pre>
        </details>}
      </div>
    </DialogContent>
  </Dialog>;
}
