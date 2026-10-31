// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import UsagePage from '../pages/UsagePage';
import type { GenerationUsage } from '../../shared/generation-usage';
import type { UsageWithBilling } from './generation-billing';

const billing = vi.hoisted(() => ({ loadUsageWithBilling: vi.fn() }));
vi.mock('./generation-billing', () => billing);
vi.mock('../hooks/useAgentChanges', () => ({ useAgentChanges: () => {} }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const request: GenerationUsage = {
  request_id: 'reported-zero', project_id: 'film', subject_id: 'shot1',
  kind: 'image_edit', provider: 'fal', model_id: 'flux-dev-fal',
  status: 'completed', settings: {}, price_basis: null,
  estimated_min_microusd: 25000, estimated_max_microusd: 25000,
  reported_microusd: 0, provider_request_id: 'provider-job-zero',
  started_at: '2026-10-31T12:00:00Z', finished_at: '2026-10-31T12:01:00Z',
  price_source: 'https://fal.ai/pricing', price_checked_at: '2026-10-31T11:00:00Z',
};
function page(items: GenerationUsage[] = [request]): UsageWithBilling {
  return { items, total_count: items.length, billing_notes: [], summary: {
    reported_microusd: 0, estimated_min_microusd: 0, estimated_max_microusd: 0,
    unknown_count: 0, total_count: items.length,
  } };
}
function renderUsage() {
  return render(<MemoryRouter initialEntries={['/usage/film']}><Routes>
    <Route path="/usage/:id" element={<UsagePage />} />
  </Routes></MemoryRouter>);
}

it('keeps human request rows compact and exposes exact receipt identity in request details', async () => {
  billing.loadUsageWithBilling.mockResolvedValue({ ok: true, value: page() });
  renderUsage();
  const model = await screen.findByRole('cell', { name: 'Flux Dev' });
  const row = model.closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).getByRole('cell', { name: 'fal.ai' })).toBeTruthy();
  expect(within(row!).getByRole('cell', { name: 'Image edit' })).toBeTruthy();
  expect(within(row!).getByRole('cell', { name: 'Completed' })).toBeTruthy();
  expect(within(row!).getByText('$0.00 reported')).toBeTruthy();
  expect(screen.queryByText('provider-job-zero')).toBeNull();
  const user = userEvent.setup();
  within(row!).getByRole('button', { name: 'View request details' }).focus();
  await user.keyboard('{Enter}');
  const details = await screen.findByRole('dialog', { name: 'Request details' });
  expect(within(details).getByText('provider-job-zero')).toBeTruthy();
  expect(within(details).getByText('flux-dev-fal')).toBeTruthy();
  expect(within(details).getByText('reported-zero')).toBeTruthy();
  expect(within(details).getByText('~$0.025')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});
