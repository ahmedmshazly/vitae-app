/**
 * Command palette keyboard locomotion: arrow highlight and Enter runs the action.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { QuickSwitcher } from './QuickSwitcher.js';

beforeEach(() => {
  resetMockApi();
});

describe('QuickSwitcher keyboard', () => {
  it('arrows through actions and Enter runs the highlighted one', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const onClose = vi.fn();

    renderWithApp(
      <QuickSwitcher
        onClose={onClose}
        onPick={vi.fn()}
        actions={[
          { id: 'a1', label: 'Open Today', run: first },
          { id: 'a2', label: 'Open Trash', run: second },
        ]}
      />,
    );

    const input = await screen.findByRole('combobox', { name: 'Command or record search' });
    expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-0');
    expect(screen.getByRole('option', { name: /Open Today/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-1');
    });
    expect(screen.getByRole('option', { name: /Open Trash/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('filters actions by typed query before Enter runs the match', async () => {
    const user = userEvent.setup();
    const trash = vi.fn();
    renderWithApp(
      <QuickSwitcher
        onClose={vi.fn()}
        onPick={vi.fn()}
        actions={[
          { id: 'a1', label: 'Open Today', run: vi.fn() },
          { id: 'a2', label: 'Open Trash', keywords: 'deleted restore', run: trash },
        ]}
      />,
    );

    const input = await screen.findByRole('combobox', { name: 'Command or record search' });
    await user.type(input, 'trash');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Open Trash/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /Open Today/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(trash).toHaveBeenCalledOnce();
  });
});
