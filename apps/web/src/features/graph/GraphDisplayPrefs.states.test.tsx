/**
 * The life map display panel.
 *
 * It used to be a hand-rolled div claiming role="dialog" while handling none
 * of what a dialog owes. Escape was the worst of it: the key fell through to
 * the map's window handler, which cleared the selection and left the panel
 * open, so the one key a person reaches for to back out did the opposite.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { DEFAULT_DISPLAY_PREFS } from './displayPrefs.js';
import { GraphDisplayPrefsPanel } from './GraphDisplayPrefs.js';

function renderPanel(over: Partial<Parameters<typeof GraphDisplayPrefsPanel>[0]> = {}) {
  const onToggle = vi.fn();
  const onPatch = vi.fn();
  const onReset = vi.fn();
  const utils = renderWithApp(
    <>
      <button type="button">Canvas</button>
      <GraphDisplayPrefsPanel
        open
        prefs={DEFAULT_DISPLAY_PREFS}
        onToggle={onToggle}
        onPatch={onPatch}
        onReset={onReset}
        {...over}
      />
    </>,
  );
  return { ...utils, onToggle, onPatch, onReset };
}

describe('GraphDisplayPrefsPanel', () => {
  it('closes on Escape instead of letting the map eat the key', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPanel();
    await user.keyboard('{Escape}');
    expect(onToggle).toHaveBeenCalled();
  });

  it('closes when the pointer goes back to the canvas', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('says on the trigger whether the panel is open', () => {
    const { rerender, onToggle, onPatch, onReset } = renderPanel({ open: false });
    const trigger = screen.getByRole('button', { name: 'Display' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    rerender(
      <>
        <button type="button">Canvas</button>
        <GraphDisplayPrefsPanel
          open
          prefs={DEFAULT_DISPLAY_PREFS}
          onToggle={onToggle}
          onPatch={onPatch}
          onReset={onReset}
        />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('gives every toggle a name and a spoken checked state', () => {
    renderPanel();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box).toHaveAccessibleName();
      expect(box).toHaveAttribute('aria-checked');
    }
  });

  it('says which label mode is on rather than tinting the chip', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPanel();
    const modes = screen.getByRole('group', { name: 'Label mode' });
    expect(within(modes).getByRole('button', { name: 'Auto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(modes).getByRole('button', { name: 'Always' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(within(modes).getByRole('button', { name: 'Always' }));
    expect(onPatch).toHaveBeenCalledWith({ labels: 'always' });
  });
});
