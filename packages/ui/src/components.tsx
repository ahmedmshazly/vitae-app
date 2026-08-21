/**
 * Vitae primitive components. Small and composable: the design
 * system's job is consistency (mono-for-data, visible provenance, explainable
 * scores), not a heavy component framework. Styles live in styles/components.css.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cva } from 'class-variance-authority';
import { Glyph, glyphForType, type GlyphName } from './glyphs.js';
import { cn } from './lib/cn.js';

// ── Button ───────────────────────────────────────────────────────────────────
const buttonVariants = cva('vt-btn', {
  variants: {
    variant: {
      default: '',
      primary: 'vt-btn--primary',
      ghost: 'vt-btn--ghost',
      danger: 'vt-btn--danger',
    },
    size: {
      sm: 'vt-btn--sm',
      md: '',
      lg: 'vt-btn--lg',
    },
  },
  defaultVariants: { variant: 'default', size: 'md' },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  glyph?: GlyphName;
}
/** Ref-forwarding so it can anchor Radix triggers (Dropdown/Popover asChild). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', glyph, children, className, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {glyph && <Glyph name={glyph} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
});

// ── Chip ─────────────────────────────────────────────────────────────────────
export interface ChipProps {
  children: ReactNode;
  glyph?: GlyphName;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  mono?: boolean;
  onRemove?: () => void;
  title?: string;
  style?: CSSProperties;
}
export function Chip({
  children,
  glyph,
  tone = 'default',
  mono,
  onRemove,
  title,
  style,
}: ChipProps) {
  return (
    <span
      className={cn(
        'vt-chip',
        tone !== 'default' && `vt-chip--${tone}`,
        mono && 'vt-chip--mono',
        onRemove && 'vt-chip--removable',
      )}
      title={title}
      style={style}
    >
      {glyph && <Glyph name={glyph} size={13} />}
      {children}
      {onRemove && (
        <button type="button" className="vt-chip__x" aria-label="Remove" onClick={onRemove}>
          <Glyph name="capture" size={12} style={{ transform: 'rotate(45deg)' }} />
        </button>
      )}
    </span>
  );
}

// ── FilterGroup ──────────────────────────────────────────────────────────────
/**
 * A set of mutually exclusive filters. They were `<button className="vt-chip">`
 * with an inline border colour on the active one: no pressed state, so which
 * filter was applied was communicated by colour alone, and a screen reader had
 * no way to tell at all.
 *
 * `aria-pressed` on each button rather than a radiogroup, because these read as
 * toggles ("show me only the decaying ones") and stay operable with plain Tab.
 */
export interface FilterGroupProps<K extends string> {
  /** Names the set, e.g. "Filter people". Announced before the buttons. */
  label: string;
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}
export function FilterGroup<K extends string>({
  label,
  options,
  value,
  onChange,
}: FilterGroupProps<K>) {
  return (
    <div className="vt-filters" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          className={cn('vt-filters__opt', o.key === value && 'vt-filters__opt--on')}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Provenance chip (SRS §4.2 provenance, design DNA) ─────────────────────────
export type Confidence = 'full' | 'half' | 'low';
export interface ProvenanceChipProps {
  source: string;
  confidence?: number; // 0..1
}
export function ProvenanceChip({ source, confidence = 1 }: ProvenanceChipProps) {
  const level: Confidence = confidence >= 0.85 ? 'full' : confidence >= 0.5 ? 'half' : 'low';
  const label = source.replace(/^import_/, '');
  return (
    <span className="vt-prov" title={`source: ${source} · confidence ${confidence.toFixed(2)}`}>
      <span className={`vt-prov__dot vt-prov__dot--${level}`} />
      {label}
    </span>
  );
}

// ── Factor chip (score decomposition, explainability, FR-CON-006) ───────────
export interface FactorChipProps {
  label: string;
  value: number;
  detail?: string;
}
export function FactorChip({ label, value, detail }: FactorChipProps) {
  const sign = value < 0 ? 'neg' : value > 0 ? 'pos' : undefined;
  return (
    <span className={cn('vt-factor', sign && `vt-factor--${sign}`)} title={detail}>
      <span className="vt-factor__label">{label}</span>
      <span className="vt-factor__value">
        {value >= 0 ? '+' : ''}
        {value.toFixed(2)}
      </span>
    </span>
  );
}

// ── Kbd ──────────────────────────────────────────────────────────────────────
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="vt-kbd">{children}</kbd>;
}

// ── Mono value ───────────────────────────────────────────────────────────────
/**
 * Monospace, tabular text, the identity's face for data.
 *
 * Spreads the rest of its props onto the span. It used to accept only
 * `children`, `className` and `style`, so a caller adding `role="status"` or an
 * `aria-label` had it silently dropped, the same trap Select had, and the
 * reason `Input` and `Textarea` spread theirs. A primitive that quietly
 * discards an accessibility attribute is worse than one that refuses it.
 */
export function Mono({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return (
    <span className={cn('u-mono', className)} {...rest}>
      {children}
    </span>
  );
}

// ── Entity glyph tile ────────────────────────────────────────────────────────
export interface EntityGlyphProps {
  type: string;
  accent?: boolean;
  size?: 'sm' | 'md';
  title?: string;
  /** Override the glyph for something that isn't a node type, a reminder, a
   * saved view. Without it the type map falls back to 'dot' and the tile's
   * title lies about what the row is. */
  glyph?: GlyphName;
}
export function EntityGlyph({ type, accent, size = 'md', title, glyph }: EntityGlyphProps) {
  return (
    <span
      className={cn('vt-glyph', accent && 'vt-glyph--accent', size === 'sm' && 'vt-glyph--sm')}
      title={title ?? type}
    >
      <Glyph name={glyph ?? glyphForType(type)} size={size === 'sm' ? 13 : 15} />
    </span>
  );
}

// ── StrengthBar ──────────────────────────────────────────────────────────────
/**
 * A 0-1 magnitude in a list row: bar plus the number, always both.
 *
 * One hue at varying opacity, not a three-way band. People and Orgs each
 * banded the value into accent/success/muted, which reads as three *categories*
 * rather than as more-or-less of one thing, the data-vis chapter's sequential
 * rule. The number beside it is what actually carries the value; the bar is for
 * scanning a column.
 */
export interface StrengthBarProps {
  /** 0-1. */
  value: number;
  /** What the number means, e.g. "tie strength". Kept short and free of the
   * row's subject: the row already announces who it is, so repeating the name
   * in every cell is verbose to a screen reader, and it made the name match
   * twice for any test querying by text. */
  label: string;
}
export function StrengthBar({ value, label }: StrengthBarProps) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="vt-strength" title={`${label} ${v.toFixed(2)}`}>
      <span className="vt-strength__track" aria-hidden>
        <span
          className="vt-strength__fill"
          style={{ width: `${v * 100}%`, opacity: 0.35 + 0.65 * v }}
        />
      </span>
      <span className="u-mono vt-strength__value">{v.toFixed(2)}</span>
      <span className="u-visually-hidden">{label}</span>
    </span>
  );
}

// ── FactorBar (score decomposition, FR-CON-006) ──────────────────────────────
/**
 * Stacked bar for score decomposition: one ink, opacity by contribution,
 * hairline gaps. The bar shows shape (one factor or several); numbers sit
 * beside it as text so colour is never the only carrier.
 */
export interface FactorPart {
  label: string;
  /** Contribution to the score, in score units (not a fraction). */
  value: number;
}
export interface FactorBarProps {
  parts: FactorPart[];
  /** Denominator for widths. Pass the best score in the set so bars compare
   *  across rows instead of each stretching to its own maximum. */
  scale: number;
  /** Names the whole bar for assistive tech, e.g. "Score 1.84". */
  label: string;
}
export function FactorBar({ parts, scale, label }: FactorBarProps) {
  const shown = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const denom = scale > 0 ? scale : 1;
  return (
    <span
      className="vt-factorbar"
      role="img"
      aria-label={`${label}: ${shown.map((p) => `${p.label} ${p.value.toFixed(2)}`).join(', ') || 'no contributing factors'}`}
    >
      {shown.map((p, i) => (
        <i
          // Keyed by position: labels come from the server and are not promised
          // to be unique, and the segments never reorder within a render.
          key={i}
          className="vt-factorbar__seg"
          style={{
            width: `${Math.min(100, (p.value / denom) * 100)}%`,
            opacity: Math.max(0.25, 0.92 - i * 0.13),
          }}
        />
      ))}
    </span>
  );
}

// ── Meter (résumé page-fill, FR-RES-009) ─────────────────────────────────────
export interface MeterProps {
  used: number;
  budget: number;
  unit?: string;
}
export function Meter({ used, budget, unit = 'lines' }: MeterProps) {
  const fill = budget > 0 ? used / budget : 0;
  const state = fill > 1 ? 'over' : fill > 0.92 ? 'warn' : 'ok';
  const fillStyle = {
    '--vt-meter-fill': Math.max(0, Math.min(fill, 1)),
  } as CSSProperties;
  return (
    <div className="vt-meter">
      <div
        className="vt-meter__track"
        role="progressbar"
        aria-label={`${used} of ${budget} ${unit}`}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={budget}
      >
        <div
          className={cn(
            'vt-meter__fill',
            state === 'warn' && 'vt-meter__fill--warn',
            state === 'over' && 'vt-meter__fill--over',
          )}
          style={fillStyle}
        />
      </div>
      <div className="vt-meter__label">
        <span>
          {Math.round(used)} / {budget} {unit}
        </span>
        <span>{Math.round(fill * 100)}%</span>
      </div>
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner() {
  return <span className="vt-spinner" role="status" aria-label="Loading" />;
}

// ── ChargeRing (reconnect lane: "relationship charge", reference arc()) ─────
export interface ChargeRingProps {
  /** Days since last interaction. */
  quiet: number;
  /** Cadence target in days. */
  cadence: number;
  size?: number;
  children?: ReactNode;
}
/**
 * Circular arc showing 1 − quiet/cadence: full = fresh, empty = overdue.
 *
 * Magnitude, so it is a sequential scale: one hue (the accent) stepping down
 * in opacity, never a hue ramp. The three off-token blues and browns this used
 * to fade through read as *categories* rather than as less-of-the-same, and
 * none of them were tokens. The arc length carries the value on its own, the
 * caller is still expected to print the number beside it.
 */
export function ChargeRing({ quiet, cadence, size = 56, children }: ChargeRingProps) {
  const r = 25;
  const circ = 2 * Math.PI * r;
  const charge = Math.max(0, Math.min(1, 1 - quiet / Math.max(1, cadence)));
  const dash = charge <= 0.001 ? `3 ${circ}` : `${(charge * circ).toFixed(1)} ${circ}`;
  return (
    <span
      className="vt-charge"
      style={{ width: size, height: size }}
      title={`${quiet}d quiet · target ${cadence}d`}
    >
      <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--ae-border)" strokeWidth="2.5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--ae-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={dash}
          strokeOpacity={0.35 + 0.6 * charge}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className="vt-charge__inner">{children}</span>
    </span>
  );
}

// ── StrengthDonut (person page, strength with decomposition ring) ───────────
export interface StrengthDonutProps {
  /** 0..1 overall tie strength. */
  strength: number;
  size?: number;
  label?: string;
}
export function StrengthDonut({ strength, size = 104, label }: StrengthDonutProps) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const s = Math.max(0, Math.min(1, strength));
  return (
    <span className="vt-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 104 104" aria-hidden>
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--ae-border)" strokeWidth="6" />
        <circle
          cx="52"
          cy="52"
          r={r}
          fill="none"
          stroke="var(--ae-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(s * circ).toFixed(1)} ${circ}`}
          transform="rotate(-90 52 52)"
        />
      </svg>
      <span className="vt-donut__center">
        <span className="vt-donut__value u-mono">{s.toFixed(2)}</span>
        {label && <span className="vt-donut__label">{label}</span>}
      </span>
    </span>
  );
}

// ── DotGrid (habit streaks: 30-day grid) ────────────────────────────────────
export interface DotGridProps {
  /** Oldest → newest; true = checked. */
  days: boolean[];
  color?: string;
  /** Highlight the most recent N days in full color; older checked days dim. */
  recentWindow?: number;
  /** What the grid counts, e.g. "Deep work". Without it the grid stays hidden
   * from assistive tech, which is what it was before, a silent 30 dots. */
  label?: string;
}
export function DotGrid({
  days,
  color = 'var(--ae-accent)',
  recentWindow = 12,
  label,
}: DotGridProps) {
  // An unchecked slot has to be visible as a slot, or a sparse grid reads as a
  // short grid. --ae-surface-raised is 1.15:1 on the canvas; --ae-border is the
  // dimmest thing that still draws.
  const done = days.filter(Boolean).length;
  const summary = label ? `${label}: ${done} of the last ${days.length} days` : undefined;
  return (
    <span
      className="vt-dotgrid"
      role={summary ? 'img' : undefined}
      aria-label={summary}
      aria-hidden={summary ? undefined : true}
    >
      {days.map((on, i) => (
        <span
          key={i}
          className="vt-dotgrid__dot"
          style={{
            background: on ? color : 'var(--ae-border)',
            opacity: on ? (i >= days.length - recentWindow ? 1 : 0.45) : 1,
          }}
        />
      ))}
    </span>
  );
}

// ── ClosenessDots (1-5 declared closeness) ───────────────────────────────────
/**
 * Closeness as a row of dots.
 *
 * The dots used to carry the whole reading in one colour channel, with the
 * number itself only in a `title` on a span, which is not a reliable place to
 * put anything. The dots are decoration now and the value is stated in text:
 * visible where there is room for it, and spoken either way.
 */
export function ClosenessDots({
  value,
  max = 5,
  showValue = false,
}: {
  value: number | null;
  max?: number;
  /** Print the count beside the dots as well as announcing it. */
  showValue?: boolean;
}) {
  const said = value != null ? `Closeness ${value} of ${max}` : 'Closeness not set';
  return (
    <span className="vt-closeness">
      <span className="vt-closeness__dots" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={cn(
              'vt-closeness__dot',
              value != null && i < value && 'vt-closeness__dot--on',
            )}
          />
        ))}
      </span>
      <span className={showValue ? 'vt-closeness__value' : 'u-visually-hidden'}>{said}</span>
    </span>
  );
}
