// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectBibleView from '../components/ProjectBibleView';
const state = vi.hoisted(() => ({
  removed: new Set<string>(),
  primary: 'take-1',
  update: vi.fn<(id: string) => Promise<void>>(),
  remove: vi.fn<(id: string) => Promise<boolean>>(),
}));
vi.mock('../components/GenerationCost', () => ({ GenerationCost: () => null }));
vi.mock('./backend-api', async (original) => ({
  ...(await original<typeof import('./backend-api')>()),
  getBibles: async () => [{ id: 'bible' }],
  getBibleAssets: async () => [{ id: 'ada', asset_type: 'character', name: 'Ada' }],
  getBibleAssetVariants: async () => ['take-1', 'take-2'].filter((id) => !state.removed.has(id)).map((id) => ({
    id, asset_id: 'ada', is_primary: id === state.primary, media_url: `/${id}.png`, prompt: 'Warm morning light', model_id: 'nano-banana', source_kind: 'generated', status: 'approved',
  })),
  updateBibleAssetVariantStatus: state.update,
  deleteBibleAssetVariant: state.remove,
}));
beforeEach(() => {
  state.removed.clear(); state.primary = 'take-1';
  state.update.mockReset().mockImplementation(async (id) => { state.primary = id; });
  state.remove.mockReset().mockImplementation(async (id) => { state.removed.add(id); if (state.primary === id) state.primary = id === 'take-1' ? 'take-2' : 'take-1'; return true; });
});
afterEach(cleanup);

it('blocks conflicting take actions while saving a new current take', async () => {
  let finish: (() => void) | undefined;
  state.update.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<ProjectBibleView projectId="film" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open Ada details' }));
  try {
    await user.click(screen.getByRole('button', { name: 'Use take 2 for Ada' }));
    expect(screen.getByRole('button', { name: 'Use take 1 for Ada' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete take 1 for Ada' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete Ada' }).hasAttribute('disabled')).toBe(true);
  } finally { await act(async () => { finish?.(); }); }
});
