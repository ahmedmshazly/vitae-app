/**
 * Official Vitae brand lockups, the Weighted V mark. One closed path, two
 * strokes of different weight (2.9:1 ratio), emphasis by weight, not by
 * colour. Achromatic: renders in `currentColor` so the same mark works on
 * any of the five surfaces or on paper. Inline SVG so it needs no asset
 * pipeline and scales crisply. Full construction spec: brand-book.html ch.05.
 */
import type { CSSProperties } from 'react';

export interface LogoMarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

// Grid 40×40, cap line/baseline y 7.5→31, thick arm 5.2 units, thin arm 1.8
// units (2.9:1) at >=32px; below that the thin arm thickens to 3.1 units so
// it doesn't vanish at small sizes.
const MARK_PATH = 'M6.8 7.5 L20 31 L31.2 7.5 L29.4 7.5 L20 26.6 L12 7.5 Z';
const MARK_PATH_SMALL = 'M6.4 7.5 L20 31 L32 7.5 L28.9 7.5 L20 25.6 L12.4 7.5 Z';
const SMALL_THRESHOLD = 32;

/** The primary mark. One ink, never coloured, stretched, or rotated. */
export function LogoMark({ size = 28, className, style, title }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={size < SMALL_THRESHOLD ? MARK_PATH_SMALL : MARK_PATH} />
    </svg>
  );
}

export interface LogoHorizontalProps {
  /** Height of the mark; the wordmark scales with it. */
  markSize?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Horizontal lockup: mark + "Vitae" wordmark (IBM Plex Mono 500, caps,
 * 0.26em tracking, the .u-display treatment). Wordmark is real text so it
 * uses the self-hosted font and stays crisp at any density.
 */
export function LogoHorizontal({ markSize = 28, className, style }: LogoHorizontalProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: markSize * 0.45, ...style }}
    >
      <LogoMark size={markSize} />
      <span
        className="u-display"
        style={{ fontSize: markSize * 0.58, color: 'var(--ae-fg-strong)', lineHeight: 1 }}
      >
        Vitae
      </span>
    </span>
  );
}

/** Stacked lockup for sign-in / empty states. Achromatic like everything else. */
export function LogoStacked({ markSize = 56, className, style }: LogoHorizontalProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: markSize * 0.28,
        ...style,
      }}
    >
      <LogoMark size={markSize} />
      <span
        className="u-display"
        style={{ fontSize: markSize * 0.58, color: 'var(--ae-fg-strong)', lineHeight: 1 }}
      >
        Vitae
      </span>
    </span>
  );
}
