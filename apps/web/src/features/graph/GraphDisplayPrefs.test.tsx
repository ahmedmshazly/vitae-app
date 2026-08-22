/**
 * Display prefs panel: expand, patch, reset.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { DEFAULT_DISPLAY_PREFS } from './displayPrefs.js';
import { GraphDisplayPrefsPanel } from './GraphDisplayPrefs.js';

describe('GraphDisplayPrefsPanel', () => {
  it('opens the panel, patches a checkbox, and resets', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onPatch = vi.fn();
    const onReset = vi.fn();

    const { rerender } = renderWithApp(
      <GraphDisplayPrefsPanel
        open={false}
        prefs={DEFAULT_DISPLAY_PREFS}
        onToggle={onToggle}
        onPatch={onPatch}
        onReset={onReset}
      />,
    );
    expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Display' }));
    expect(onToggle).toHaveBeenCalled();

    rerender(
      <GraphDisplayPrefsPanel
        open
        prefs={DEFAULT_DISPLAY_PREFS}
        onToggle={onToggle}
        onPatch={onPatch}
        onReset={onReset}
      />,
    );
    expect(screen.getByRole('group', { name: 'Life map display preferences' })).toBeInTheDocument();
    await user.click(screen.getByLabelText('Dim non-neighbors on hover'));
    expect(onPatch).toHaveBeenCalledWith({ dimOnHover: false });
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalled();
  });
});
