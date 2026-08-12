import { act, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MotionReact from 'motion/react';
import { flashToast, ToastProvider, useToast } from './Toast.js';

// AnimatePresence keeps an exiting child mounted until its exit animation
// completes, which is driven by rAF timing that doesn't resolve
// deterministically under fake timers. These tests exercise the dismiss-
// timer logic, not Framer Motion's animation engine (already trusted,
// third-party), so AnimatePresence is mocked to a passthrough, when
// `toast` becomes null the motion.div just unmounts immediately, like any
// normal conditional render.
// Note there is no `useReducedMotion` override here any more. Toast reads the
// preference through lib/motion's hooks, which source it from @vitae/ui rather
// than from Framer, so overriding Framer's hook stopped doing anything and
// only advertised a reduced-motion run that was not happening.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

function Harness({ onUndo }: { onUndo: () => void | Promise<void> }) {
  const { flash } = useToast();
  return (
    <div>
      <button onClick={() => flash('Saved')}>flash-plain</button>
      <button onClick={() => flash('Saved', { undo: onUndo })}>flash-undo</button>
      <button onClick={() => flash('Sync failed', { variant: 'error' })}>flash-error</button>
    </div>
  );
}

function renderHarness(onUndo: () => void | Promise<void> = vi.fn()) {
  render(
    <ToastProvider>
      <Harness onUndo={onUndo} />
    </ToastProvider>,
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the flashed message as role=status by default', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-plain'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('uses role=alert for an error-variant toast', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Sync failed');
  });

  it('flashToast (the non-component escape hatch) always flashes as an error', () => {
    renderHarness();
    act(() => {
      flashToast('Mutation failed');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Mutation failed');
  });

  it('auto-dismisses a plain toast at 5s, not before', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-plain'));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('holds a toast with Undo for 8s instead of 5s', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-undo'));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pauses the dismiss timer while the pointer is over the toast', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-plain'));
    const toast = screen.getByRole('status');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.pointerEnter(toast);
    act(() => {
      vi.advanceTimersByTime(10000); // would have long since dismissed if not paused
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.pointerLeave(toast);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Undo fires the compensating call and dismisses immediately', () => {
    const onUndo = vi.fn();
    renderHarness(onUndo);
    fireEvent.click(screen.getByText('flash-undo'));
    fireEvent.click(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('a second flash() replaces the first, only one toast at a time', () => {
    renderHarness();
    fireEvent.click(screen.getByText('flash-plain'));
    expect(screen.getAllByText('Saved')).toHaveLength(1);
    fireEvent.click(screen.getByText('flash-error'));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sync failed');
  });
});
