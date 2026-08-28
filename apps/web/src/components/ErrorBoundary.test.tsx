import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, ShellErrorFallback } from './ErrorBoundary.js';

let shouldThrow = true;
function Bomb(): never | null {
  if (shouldThrow) throw new Error('boom');
  return null;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs the caught error to console; expected noise, not a signal.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the default retry panel instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This page hit an error')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retry re-renders children, recovering once the underlying problem clears', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This page hit an error')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText('This page hit an error')).not.toBeInTheDocument();
  });

  it('a route-level crash does not unmount a sibling shell/nav outside the boundary', () => {
    render(
      <div>
        <nav aria-label="Primary">
          <a href="/people">People</a>
        </nav>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(screen.getByText('This page hit an error')).toBeInTheDocument();
  });

  it('supports a custom fallback (the shell-level usage)', () => {
    render(
      <ErrorBoundary fallback={(retry) => <ShellErrorFallback retry={retry} />}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Vitae hit an error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });

  it('ShellErrorFallback\'s "Try again" resets via the same retry callback', () => {
    render(
      <ErrorBoundary fallback={(retry) => <ShellErrorFallback retry={retry} />}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Vitae hit an error')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Vitae hit an error')).not.toBeInTheDocument();
  });
});
