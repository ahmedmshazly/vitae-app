/**
 * Chronograph toolbar: mode, zoom, last-lane guard, display popover.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@vitae/ui';
import { renderWithApp } from '../../test/render.js';
import { DEFAULT_TIMELINE_PREFS } from './displayPrefs.js';
import { TimelineToolbar } from './TimelineToolbar.js';

describe('TimelineToolbar', () => {
  it('exposes mode and zoom groups and disables the sole active lane', async () => {
    const user = userEvent.setup();
    const onMode = vi.fn();
    const onZoom = vi.fn();
    const onTogglePrefs = vi.fn();
    renderWithApp(
      <TimelineToolbar
        zoom="year"
        onZoom={onZoom}
        mode="chronograph"
        onMode={onMode}
        prefs={{ ...DEFAULT_TIMELINE_PREFS, activeLanes: ['Roles'] }}
        onPatchPrefs={() => {}}
        prefsOpen={false}
        onTogglePrefs={onTogglePrefs}
        onClosePrefs={() => {}}
        onResetPrefs={() => {}}
        onToday={() => {}}
        onFit={() => {}}
        hint="Career years"
      />,
    );

    expect(screen.getByRole('group', { name: 'View mode' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(onMode).toHaveBeenCalledWith('list');

    await user.click(screen.getByRole('button', { name: 'month' }));
    expect(onZoom).toHaveBeenCalledWith('month');

    expect(screen.getByRole('button', { name: 'Roles' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Display' }));
    expect(onTogglePrefs).toHaveBeenCalled();
  });

  it('uses the shared display popover, which Escape can dismiss', async () => {
    const user = userEvent.setup();
    const onClosePrefs = vi.fn();
    renderWithApp(
      <TimelineToolbar
        zoom="year"
        onZoom={() => {}}
        mode="list"
        onMode={() => {}}
        prefs={DEFAULT_TIMELINE_PREFS}
        onPatchPrefs={() => {}}
        prefsOpen
        onTogglePrefs={() => {}}
        onClosePrefs={onClosePrefs}
        onResetPrefs={() => {}}
        onToday={() => {}}
        onFit={() => {}}
        hint="Career years"
      />,
      { wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider> },
    );
    expect(screen.getByLabelText('Timeline display')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show subtitles on bars' })).toBeChecked();
    await user.keyboard('{Escape}');
    expect(onClosePrefs).toHaveBeenCalled();
  });
});
