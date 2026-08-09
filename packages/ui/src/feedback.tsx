/**
 * Loading / empty / error feedback primitives. Skeletons pulse opacity only.
 * no gradient sweep (brand rule: no shimmer, no glassmorphism).
 */
import type { CSSProperties, ReactNode } from 'react';
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
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="vt-skel-rows" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="vt-skel-rows__row" style={{ animationDelay: `${i * 60}ms` }}>
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
  action?: ReactNode;
}
export function EmptyState({ glyph = 'dot', title, hint, action }: EmptyStateProps) {
  return (
    <div className="vt-empty">
      <span className="vt-empty__glyph">
        <Glyph name={glyph} size={22} />
      </span>
      <span className="vt-empty__title">{title}</span>
      {hint && <span className="vt-empty__hint">{hint}</span>}
      {action && <span className="vt-empty__action">{action}</span>}
    </div>
  );
}

// ── ErrorState ───────────────────────────────────────────────────────────────
export interface ErrorStateProps {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}
export function ErrorState({ title = 'Something went wrong', detail, onRetry }: ErrorStateProps) {
  return (
    <div className="vt-error" role="alert">
      <span className="vt-error__title">{title}</span>
      {detail && <span className="vt-error__detail u-mono">{detail}</span>}
      {onRetry && (
        <button type="button" className="vt-btn vt-btn--sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
