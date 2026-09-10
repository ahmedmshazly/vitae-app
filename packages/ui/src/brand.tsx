/**
 * Official Vitae brand lockups, the Weighted V mark. One closed path, two
 * strokes of different weight (2.9:1 ratio), emphasis by weight, not by
 * colour. Inline SVG so it needs no asset pipeline and scales crisply. Full
 * construction spec: brand-book.html ch.05.
 *
 * The mark is no longer achromatic. Under the light/dark/high-contrast identity
 * the action colour is --deleg (Delegate yellow), and the mark is the one place
 * it appears without being a control, so `variant` picks between that, plain
 * --ink, and `currentColor` for a caller that owns the colour itself (a button
 * label, a print sheet). Weight still carries the emphasis; hue only says which
 * surface the mark is sitting on.
 */
import type { CSSProperties } from 'react';

export interface LogoMarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Colour variant: 'primary' (yellow/deleg) | 'secondary' (ink) | 'inherit' (currentColor) */
  variant?: 'primary' | 'secondary' | 'inherit';
}

// Grid 40×40, cap line/baseline y 7.5→31, thick arm 5.2 units, thin arm 1.8
// units (2.9:1) at >=32px; below that the thin arm thickens to 3.1 units so
// it doesn't vanish at small sizes.
const MARK_PATH = 'M6.8 7.5 L20 31 L31.2 7.5 L29.4 7.5 L20 26.6 L12 7.5 Z';
const MARK_PATH_SMALL = 'M6.4 7.5 L20 31 L32 7.5 L28.9 7.5 L20 25.6 L12.4 7.5 Z';
const SMALL_THRESHOLD = 32;

function getFill(variant: LogoMarkProps['variant']): string {
  switch (variant) {
    case 'primary':
      return 'var(--deleg)';
    case 'secondary':
      return 'var(--ink)';
    default:
      return 'currentColor';
  }
}

/**
 * The wordmark's ink. It is never the action colour: yellow on "Vitae" at
 * lockup sizes does not clear 4.5:1 on any of the three themes, and the mark
 * beside it already carries the hue. So the wordmark is --ink for both coloured
 * variants, and only defers to the caller under `inherit`.
 */
function getWordmarkColor(variant: LogoMarkProps['variant']): string {
  return variant === 'inherit' ? 'currentColor' : 'var(--ink)';
}

/** The primary mark. Never stretched, sheared, or rotated. */
export function LogoMark({
  size = 28,
  className,
  style,
  title,
  variant = 'primary',
}: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill={getFill(variant)}
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
  variant?: 'primary' | 'secondary' | 'inherit';
}

/**
 * Horizontal lockup: mark + "Vitae" wordmark (Archivo Black, caps, -0.035em
 * tracking, the .u-display treatment). Wordmark is real text so it uses the
 * self-hosted face and stays crisp at any density.
 */
export function LogoHorizontal({
  markSize = 28,
  className,
  style,
  variant = 'primary',
}: LogoHorizontalProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: markSize * 0.45, ...style }}
    >
      <LogoMark size={markSize} variant={variant} />
      <span
        className="u-display"
        style={{ fontSize: markSize * 0.58, color: getWordmarkColor(variant), lineHeight: 1 }}
      >
        Vitae
      </span>
    </span>
  );
}

/** Stacked lockup for sign-in / empty states. */
export function LogoStacked({
  markSize = 56,
  className,
  style,
  variant = 'primary',
}: LogoHorizontalProps) {
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
      <LogoMark size={markSize} variant={variant} />
      <span
        className="u-display"
        style={{ fontSize: markSize * 0.58, color: getWordmarkColor(variant), lineHeight: 1 }}
      >
        Vitae
      </span>
    </span>
  );
}
