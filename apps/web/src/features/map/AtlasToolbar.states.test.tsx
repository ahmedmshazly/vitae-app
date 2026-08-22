/**
 * Atlas chrome: the two filter bands, the custom period inputs, and the More
 * panel. The bands carried an aria-label on a plain div, which ARIA drops, and
 * the panel was a bare div that no key could close.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@vitae/ui';
import { renderWithApp } from '../../test/render.js';
import { DEFAULT_ATLAS_PREFS } from './displayPrefs.js';
import { AtlasToolbar, type AtlasToolbarProps } from './AtlasToolbar.js';

function toolbar(over: Partial<AtlasToolbarProps> = {}) {
  const props: AtlasToolbarProps = {
    mode: 'atlas',
    onMode: () => {},
    activeFilters: new Set<string>(),
    onToggleFilter: () => {},
    period: 'all',
    onPeriod: () => {},
    year: 2026,
    customFrom: '',
    customTo: '',
    onCustomFrom: () => {},
    onCustomTo: () => {},
    prefs: DEFAULT_ATLAS_PREFS,
    onPatchPrefs: () => {},
    prefsOpen: false,
    onTogglePrefs: () => {},
    onClosePrefs: () => {},
    onResetPrefs: () => {},
    onExportPng: () => {},
    onFind: () => {},
    findOpen: false,
    hint: 'Places you have records for',
    unmappedCount: 0,
    unmappedDockOpen: false,
    onUnmappedClick: () => {},
    ...over,
  };
  return renderWithApp(<AtlasToolbar {...props} />, {
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
}

describe('AtlasToolbar states', () => {
  it('names both filter bands from the words printed beside them', () => {
    toolbar();
    const records = screen.getByRole('group', { name: 'Records' });
    expect(records).toContainElement(screen.getByRole('button', { name: 'people' }));
    const period = screen.getByRole('group', { name: 'Period' });
    expect(period).toContainElement(screen.getByRole('button', { name: 'All time' }));
  });

  it('names both ends of a custom period', async () => {
    const user = userEvent.setup();
    const onCustomFrom = vi.fn();
    toolbar({ period: 'custom', customFrom: '2020-01-01', customTo: '2021-01-01', onCustomFrom });
    const from = screen.getByLabelText('From date');
    expect(from).toHaveValue('2020-01-01');
    expect(screen.getByLabelText('To date')).toHaveValue('2021-01-01');
    await user.clear(from);
    expect(onCustomFrom).toHaveBeenCalled();
  });

  it('puts the display options in a panel a key can reach and close', async () => {
    const user = userEvent.setup();
    const onClosePrefs = vi.fn();
    toolbar({ prefsOpen: true, onClosePrefs });
    expect(screen.getByRole('checkbox', { name: 'Show city labels' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cluster at low zoom' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClosePrefs).toHaveBeenCalled();
  });

  it('explains corridor patterns somewhere a keyboard can read it', async () => {
    const user = userEvent.setup();
    toolbar();
    await user.tab();
    await user.hover(screen.getByRole('button', { name: 'Patterns' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Show corridor patterns between places',
    );
  });
});
