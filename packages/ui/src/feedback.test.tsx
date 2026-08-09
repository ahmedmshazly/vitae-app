import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from './feedback.js';

describe('Skeleton', () => {
  it('renders with the vt-skel class and no shimmer-sweep class', () => {
    render(<Skeleton />);
    const el = document.querySelector('.vt-skel');
    expect(el).toBeInTheDocument();
    expect(el?.className).not.toMatch(/shimmer|sweep|shine/i);
  });

  it('respects a round modifier and custom size', () => {
    render(<Skeleton round width={20} height={20} />);
    const el = document.querySelector('.vt-skel--round');
    expect(el).toBeInTheDocument();
  });

  // jsdom doesn't evaluate stylesheets or @media queries, so the pulse
  // animation's actual reduced-motion behavior isn't observable from a
  // rendered-DOM assertion here (it's covered by the e2e a11y pass). This
  // pins the CSS contract itself, the standing rule (opacity-pulse only,
  // zeroed under prefers-reduced-motion), so an edit to components.css that
  // silently drops the override fails a test instead of shipping unnoticed.
  it('components.css pulses opacity only and zeroes it under prefers-reduced-motion', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/components.css'), 'utf8');
    expect(css).toMatch(/@keyframes vt-skel-pulse\s*{\s*0%,\s*100%\s*{\s*opacity: 1;/);
    expect(css).not.toMatch(/vt-skel[^}]*shimmer/i);
    // components.css has more than one reduced-motion block (e.g. .vt-spinner
    // has its own), find the one that actually covers .vt-skel.
    const reducedBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g)];
    expect(reducedBlocks.some((b) => b[0].includes('.vt-skel,'))).toBe(true);
  });
});

describe('SkeletonRows', () => {
  it('renders the requested row count with a status role', () => {
    render(<SkeletonRows rows={4} />);
    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status.querySelectorAll('.vt-skel-rows__row')).toHaveLength(4);
  });
});

describe('EmptyState', () => {
  it('renders title, hint, and action', () => {
    render(<EmptyState title="No records yet" hint="Add your first one." action={<button>Add</button>} />);
    expect(screen.getByText('No records yet')).toBeInTheDocument();
    expect(screen.getByText('Add your first one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('renders as an alert with title, mono detail, and a working retry', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Couldn't load" detail="500 Internal Server Error" onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load");
    expect(screen.getByText('500 Internal Server Error')).toHaveClass('u-mono');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
