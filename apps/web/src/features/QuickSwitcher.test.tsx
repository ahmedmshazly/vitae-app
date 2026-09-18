/**
 * Command palette keyboard locomotion: arrow highlight and Enter runs the action.
 */
import './../test/api-mock.js';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { QuickSwitcher } from './QuickSwitcher.js';

beforeEach(() => {
  resetMockApi();
});

describe('QuickSwitcher keyboard', () => {
  it('does not offer stale results while a new query is debouncing', async () => {
    mockApi.get.mockResolvedValue({ results: [{ id: 'p1', type: 'person', title: 'Ada' }] });
    const onPick = vi.fn();
    renderWithApp(<QuickSwitcher onClose={vi.fn()} onPick={onPick} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Ada' } });
    await screen.findByRole('option', { name: /Ada/ });
    fireEvent.change(input, { target: { value: 'Grace' } });
    expect(screen.queryByRole('option', { name: /Ada/ })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('keeps the first result reachable after arrowing an empty list', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ results: [{ id: 'p1', type: 'person', title: 'Ada' }] });
    renderWithApp(<QuickSwitcher onClose={vi.fn()} onPick={vi.fn()} />);
    const input = screen.getByRole('combobox');
    await user.keyboard('{ArrowDown}');
    expect(input).not.toHaveAttribute('aria-controls');
    await user.type(input, 'Ada');
    await screen.findByRole('option', { name: /Ada/ });
    expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-0');
  });

  it('does not execute an action on an IME confirmation key', () => {
    const run = vi.fn();
    renderWithApp(
      <QuickSwitcher
        onClose={vi.fn()}
        onPick={vi.fn()}
        actions={[{ id: 'a', label: 'Action', run }]}
      />,
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', isComposing: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('can retry a failed lookup without changing the query', async () => {
    const user = userEvent.setup();
    mockApi.get
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ results: [{ id: 'p1', type: 'person', title: 'Ada' }] });
    renderWithApp(<QuickSwitcher onClose={vi.fn()} onPick={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'Ada');
    await user.click(await screen.findByRole('button', { name: 'Retry search' }));
    expect(await screen.findByRole('option', { name: /Ada/ })).toBeInTheDocument();
  });
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
    expect(screen.getByRole('option', { name: /Open Today/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-1');
    });
    expect(screen.getByRole('option', { name: /Open Trash/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

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

  it('supports Home and End across the complete result set', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <QuickSwitcher
        onClose={vi.fn()}
        onPick={vi.fn()}
        actions={[
          { id: 'a1', label: 'Open Today', run: vi.fn() },
          { id: 'a2', label: 'Open Trash', run: vi.fn() },
          { id: 'a3', label: 'Open Settings', run: vi.fn() },
        ]}
      />,
    );

    const input = await screen.findByRole('combobox', { name: 'Command or record search' });
    await user.keyboard('{End}');
    expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-2');
    expect(screen.getByRole('option', { name: /Open Settings/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{Home}');
    expect(input).toHaveAttribute('aria-activedescendant', 'quickswitcher-option-0');
    expect(screen.getByRole('option', { name: /Open Today/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('does not call a failed record search an empty result', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('offline'));
    renderWithApp(<QuickSwitcher onClose={vi.fn()} onPick={vi.fn()} />);

    await user.type(
      await screen.findByRole('combobox', { name: 'Command or record search' }),
      'ada',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search failed. Commands still work.',
    );
    expect(screen.queryByText(/No command or record matches/)).not.toBeInTheDocument();
  });
});
