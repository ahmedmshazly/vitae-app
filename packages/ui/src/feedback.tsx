/**
 * Loading / empty / error feedback primitives. Skeletons pulse opacity only.
 * no gradient sweep (brand rule: no shimmer, no glassmorphism).
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Glyph, type GlyphName } from './glyphs.js';
import { cn } from './lib/cn.js';

// ── Skeleton ─────────────────────────────────────────────────────────────────
export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  round?: boolean;
  className?: string;
  style?: CSSProperties;
}
export function Skeleton({ width = '100%', height = 14, round, className, style }: SkeletonProps) {
  return (
    <span
      className={cn('vt-skel', round && 'vt-skel--round', className)}
      style={{ width, height, ...style }}
      aria-hidden
    />
  );
}

/** N stacked text lines, the last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('vt-skel-text', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}

/** A list-page skeleton: N rows of glyph + two lines. */
export interface SkeletonRowsProps {
  rows?: number;
  /** Compatibility alias used by workspace skeletons. `rows` wins. */
  count?: number;
  /** What is being waited for, in the user's words. */
  label?: string;
  className?: string;
}
export function SkeletonRows({ rows, count = 6, label = 'Loading', className }: SkeletonRowsProps) {
  const rowCount = Math.max(0, Math.floor(rows ?? count));
  return (
    <div
      className={cn('vt-skel-rows', className)}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      {Array.from({ length: rowCount }, (_, i) => (
        <div
          key={i}
          className="vt-skel-rows__row"
          style={{ '--vt-skeleton-index': Math.min(i, 5) } as CSSProperties}
        >
          <Skeleton width={26} height={26} />
          <span className="vt-skel-rows__lines">
            <Skeleton height={12} width={`${55 - (i % 3) * 10}%`} />
            <Skeleton height={10} width={`${30 + (i % 4) * 8}%`} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export interface EmptyStateProps {
  glyph?: GlyphName;
  title: string;
  hint?: ReactNode;
  /** Compatibility alias for hint in task-oriented workspace states. */
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}
export function EmptyState({
  glyph = 'dot',
  title,
  hint,
  detail,
  action,
  className,
}: EmptyStateProps) {
  const description = hint ?? detail;
  return (
    <div className={cn('vt-empty', className)}>
      <span className="vt-empty__glyph">
        <Glyph name={glyph} size={22} />
      </span>
      <span className="vt-empty__title">{title}</span>
      {description && <span className="vt-empty__hint">{description}</span>}
      {action && <span className="vt-empty__action">{action}</span>}
    </div>
  );
}

// ── ErrorState ───────────────────────────────────────────────────────────────
export interface ErrorStateProps {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
}
export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
  retryLabel = 'Retry',
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('vt-error', className)} role="alert">
      <span className="vt-error__title">{title}</span>
      {detail && <span className="vt-error__detail u-mono">{detail}</span>}
      {onRetry && (
        <button type="button" className="vt-btn vt-btn--sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : retryLabel}
        </button>
      )}
    </div>
  );
}

// ── StatusTrace ─────────────────────────────────────────────────────────────
export type StatusTraceTone = 'neutral' | 'live' | 'success' | 'warning' | 'danger';

export interface StatusTraceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Short state text: "Refreshing records", "Draft saved". */
  label: ReactNode;
  /** Optional evidence, timestamp, or stage counter. */
  detail?: ReactNode;
  tone?: StatusTraceTone;
  /** Set false when a surrounding live region already announces the state. */
  announce?: boolean;
}

/**
 * A compact textual + visual state signal for the Living Ledger.
 *
 * The line and node echo a record moving through a trace, but the label is
 * always present and carries the meaning. Its motion runs once when the state
 * mounts; it never loops, pulses, or pretends that idle work is progressing.
 */
export function StatusTrace({
  label,
  detail,
  tone = 'neutral',
  announce = true,
  className,
  ...rest
}: StatusTraceProps) {
  return (
    <div
      className={cn('vt-status-trace', `vt-status-trace--${tone}`, className)}
      role={announce ? (tone === 'danger' ? 'alert' : 'status') : undefined}
      aria-live={announce ? (tone === 'danger' ? 'assertive' : 'polite') : undefined}
      {...rest}
    >
      <span className="vt-status-trace__mark" aria-hidden>
        <span className="vt-status-trace__node" />
      </span>
      <span className="vt-status-trace__label">{label}</span>
      {detail != null && <span className="vt-status-trace__detail u-mono">{detail}</span>}
    </div>
  );
}
