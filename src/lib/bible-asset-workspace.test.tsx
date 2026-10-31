// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import ProjectBibleView from '../components/ProjectBibleView';

vi.mock('../components/GenerationCost', () => ({ GenerationCost: () => null }));
vi.mock('./backend-api', async (original) => ({
  ...(await original<typeof import('./backend-api')>()),
  getBibles: async () => [{ id: 'bible' }],
  getBibleAssets: async () => [
    { id: 'ada', asset_type: 'character', name: 'Ada' },
    { id: 'home', asset_type: 'location', name: 'Home' },
    { id: 'opening', asset_type: 'reference', name: 'Opening' },
  ],
  getBibleAssetVariants: async (assetId: string) => [
    { id: `${assetId}-1`, asset_id: assetId, is_primary: true, media_url: `/${assetId}-1.png`, prompt: 'Warm morning light', model_id: 'nano-banana', source_kind: 'generated', status: 'approved' },
    { id: `${assetId}-2`, asset_id: assetId, is_primary: false, media_url: `/${assetId}-2.png`, prompt: 'Window light', model_id: 'nano-banana', source_kind: 'generated', status: 'approved' },
  ],
}));
afterEach(cleanup);

it.each([
  ['characters', 'Ada', 'New character'],
  ['locations', 'Home', 'New location'],
  ['frames', 'Opening', 'New frame'],
] as const)('opens %s assets as a dedicated workspace rather than a popover', async (initialTab, name, composerName) => {
  render(<ProjectBibleView projectId="film" initialTab={initialTab} />);
  const user = userEvent.setup();
  const open = await screen.findByRole('button', { name: `Open ${name} details` });
  await user.click(open);
  const workspace = await screen.findByRole('region', { name: `${name} details` });
  expect(screen.queryByRole('complementary', { name: composerName })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(within(workspace).getByText('Warm morning light')).toBeTruthy();
  expect(within(workspace).getByRole('button', { name: `Use take 1 for ${name}` }).getAttribute('aria-pressed')).toBe('true');
  expect(within(workspace).getByRole('button', { name: `Delete take 2 for ${name}` })).toBeTruthy();
  await user.click(within(workspace).getByRole('button', { name: 'Back to library' }));
  expect(screen.queryByRole('region', { name: `${name} details` })).toBeNull();
  expect(screen.getByRole('complementary', { name: composerName })).toBeTruthy();
});
