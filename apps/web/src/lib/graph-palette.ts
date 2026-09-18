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

export function readGraphPalette(theme: 'light' | 'dark' | 'hc' = 'light'): GraphPalette {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const atlas = theme === 'light'
    ? { bg: '#e9e2ed', plate: '#f5f0f7', fg: '#171622', muted: '#565066', border: '#b8adc4', accent: '#6e56bd', accentSoft: '#baa4ed', dim: '#938b9e', slots: ['#247b76', '#6e56bd', '#a95928', '#5e7098', '#9b5a83', '#6d7441', '#9b6372', '#64708a'] }
    : theme === 'hc'
      ? { bg: '#11101a', plate: '#050509', fg: '#ffffff', muted: '#e4d8ff', border: '#ffffff', accent: '#e4d8ff', accentSoft: '#a5fff5', dim: '#b9b0c8', slots: ['#a5fff5', '#e4d8ff', '#ffd0a4', '#bcd3ff', '#ffb4d4', '#e4ffab', '#ffc58e', '#d5e1ff'] }
      : { bg: '#242132', plate: '#171622', fg: '#f5f0f7', muted: '#c7bfd0', border: '#5a5366', accent: '#baa4ed', accentSoft: '#7cc9c1', dim: '#71697e', slots: ['#7cc9c1', '#baa4ed', '#f0b385', '#8ba2d6', '#d98ab6', '#b7ca7b', '#d58b98', '#a9b5d1'] };
  return {
    bg: atlas.bg,
    border: atlas.border,
    borderStrong: atlas.border,
    muted: atlas.muted,
    faint: atlas.muted,
    fg: atlas.fg,
    accent: atlas.accent,
    accentSoft: atlas.accentSoft,
    plate: atlas.plate,
    dim: atlas.dim,
    // Was hardcoded to 'IBM Plex Sans' in the draw call, which is the app's
    // *previous* sans face, still shipped for the entity catalogue, so the
    // labels really did render in it, in a typeface used nowhere else on
    // screen. The identity's sans is Space Grotesk.
    fontSans: v('--ae-font-sans', "'Space Grotesk', ui-sans-serif, sans-serif"),
    fontMono: v('--ae-font-mono', "'Space Mono', ui-monospace, monospace"),
    slots: atlas.slots,
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
