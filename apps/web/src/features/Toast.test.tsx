import { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flashToast, ToastProvider, useToast } from './Toast.js';

function Harness({ onUndo }: { onUndo: () => void | Promise<void> }) {
  const { flash } = useToast();
  return (
    <div>
      <button onClick={() => flash('Saved')}>flash-plain</button>
      <button onClick={() => flash('Saved', { undo: onUndo })}>flash-undo</button>
      <button onClick={() => flash('Sync failed', { variant: 'error' })}>flash-error</button>
      <button
        onClick={() => {
          flash('First saved');
          flash('Second saved');
        }}
      >
        flash-two
      </button>
    </div>
  );
}

function renderHarness(onUndo: () => void | Promise<void> = vi.fn()) {
  return render(
    <ToastProvider>
      <Harness onUndo={onUndo} />
    </ToastProvider>,
  );
}

function toastFor(message: string): HTMLElement {
  const toast = screen.getByText(message).closest('li');
  if (!toast) throw new Error(`No toast wraps ${message}`);
  return toast;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast compatibility adapter', () => {
  it('mounts the robust notification region before the first message', () => {
    renderHarness();
    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('keeps flash(message) and maps it to the neutral design-system variant', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-plain'));

    expect(toastFor('Saved')).toHaveAttribute('data-variant', 'status');
    expect(toastFor('Saved')).toHaveClass('toast');
  });

  it('maps the app error variant to a labelled, glyph-backed error toast', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-error'));

    const toast = toastFor('Sync failed');
    expect(toast).toHaveAttribute('data-variant', 'error');
    expect(within(toast).getByText('Error')).toBeInTheDocument();
    expect(toast.querySelector('.vt-toast__glyph svg')).not.toBeNull();
  });

  it('keeps flashToast as an error escape hatch for non-component callers', () => {
    renderHarness();
    act(() => flashToast('Mutation failed'));

    expect(toastFor('Mutation failed')).toHaveAttribute('data-variant', 'error');
  });

  it('maps undo to a live queued action and closes only that item', async () => {
    const onUndo = vi.fn();
    renderHarness(onUndo);
    fireEvent.click(screen.getByText('flash-two'));
    fireEvent.click(screen.getByText('flash-undo'));

    const item = toastFor('Saved');
    fireEvent.click(within(item).getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument());
    expect(screen.getByText('First saved')).toBeInTheDocument();
    expect(screen.getByText('Second saved')).toBeInTheDocument();
  });

  it('queues flashes fired in the same tick instead of replacing feedback', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-two'));

    expect(screen.getByText('First saved')).toBeInTheDocument();
    expect(screen.getByText('Second saved')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('preserves the eight-second Undo window from the app API', async () => {
    vi.useFakeTimers();
    renderHarness();
    fireEvent.click(screen.getByText('flash-undo'));
    const item = toastFor('Saved');

    await act(async () => vi.advanceTimersByTime(7999));
    expect(item).toHaveAttribute('data-state', 'open');

    await act(async () => vi.advanceTimersByTime(1));
    expect(item).toHaveAttribute('data-state', 'closed');
  });

  it('turns a rejected Undo into actionable error feedback', async () => {
    renderHarness(() => Promise.reject(new Error('offline')));
    fireEvent.click(screen.getByText('flash-undo'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    const failure = await screen.findByText("Couldn't undo that change");
    expect(failure.closest('li')).toHaveAttribute('data-variant', 'error');
  });
});
