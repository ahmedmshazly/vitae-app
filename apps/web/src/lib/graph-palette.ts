/**
 * Graph node colors, read from the --ae-viz-* tokens at runtime so the canvas
 * stays in lockstep with tokens.css (no hard-coded hex drift). Slots are
 * assigned in FIXED order per the categorical-color rule, a type keeps its
 * hue no matter which filters are active. Identity is never color-alone:
 * nodes also carry direct labels, so the one CVD floor-band pair is covered.
 */

const TYPE_SLOT: Record<string, number> = {
  person: 1,
  organization: 2,
  role: 3,
  project: 4,
  skill: 5,
  event: 6,
  interaction: 7,
  repository: 8,
  // Long-tail types share the 8-slot categorical band (fixed order).
  education: 2,
  certification: 5,
  course: 5,
  publication: 4,
  talk: 4,
  award: 3,
  post: 7,
  document: 8,
  link: 8,
  location: 6,
  job_posting: 3,
  application: 3,
  interview: 6,
  reference: 1,
  task: 6,
  goal: 6,
  idea: 7,
};

export interface GraphPalette {
  bg: string;
  border: string;
  borderStrong: string;
  muted: string;
  faint: string;
  fg: string;
  accent: string;
  accentSoft: string;
  /** Ground the canvas draws label plates on, the page's own background. */
  plate: string;
  /** The dimmed-out ink for links the current lens is not talking about. */
  dim: string;
  /** The face node labels are drawn in. Canvas takes a font string, not a
   *  class, so the family has to be read out of the token like a colour. */
  fontSans: string;
  fontMono: string;
  slots: string[]; // viz-1..viz-8
}

export function readGraphPalette(): GraphPalette {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--ae-bg', '#0f0f0f'),
    border: v('--ae-border', '#2b2b2b'),
    borderStrong: v('--ae-border-strong', '#3f3f3f'),
    muted: v('--ae-muted', '#a3a3a0'),
    faint: v('--ae-faint', '#8f8f8c'),
    fg: v('--ae-fg', '#e8e8e6'),
    accent: v('--ae-accent', '#fafaf8'),
    accentSoft: v('--ae-accent-soft', '#c9c9c6'),
    plate: v('--ae-bg', '#0f0f0f'),
    dim: v('--ae-border', '#2b2b2b'),
    // Was hardcoded to 'IBM Plex Sans' in the draw call, which is the app's
    // *previous* sans face, still shipped for the entity catalogue, so the
    // labels really did render in it, in a typeface used nowhere else on
    // screen. The identity's sans is Instrument Sans.
    fontSans: v('--ae-font-sans', "'Instrument Sans Variable', ui-sans-serif, sans-serif"),
    fontMono: v('--ae-font-mono', "'IBM Plex Mono', ui-monospace, monospace"),
    slots: [
      v('--ae-viz-1', '#1f9c86'),
      v('--ae-viz-2', '#b08a18'),
      v('--ae-viz-3', '#6e8fd0'),
      v('--ae-viz-4', '#c8503f'),
      v('--ae-viz-5', '#a87bc0'),
      v('--ae-viz-6', '#7e9b3a'),
      v('--ae-viz-7', '#d4649b'),
      v('--ae-viz-8', '#c56a2a'),
    ],
  };
}

/** Color for a node type; long-tail types share the neutral muted tone. */
export function colorForType(palette: GraphPalette, type: string): string {
  const slot = TYPE_SLOT[type];
  return slot ? palette.slots[slot - 1]! : palette.muted;
}

/**
 * Make a token translucent for a canvas or an inline style.
 *
 * Tokens are `#rrggbb`; anything else is handed back untouched rather than
 * mangled into an invalid colour. That matters more than it looks: canvas does
 * not throw on a bad `fillStyle`, it silently keeps the previous one, and the
 * timeline used to build its bar tints by string-concatenating an alpha suffix
 * (`${base}22`), which produces `#rrggbb22`, valid only if the token really is
 * six-digit hex, and silently wrong the moment one is not.
 */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
