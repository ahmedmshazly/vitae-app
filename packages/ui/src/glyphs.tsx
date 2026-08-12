/**
 * Entity + utility glyphs (24px grid, 1.6px stroke). The 16 official brand
 * icons carry the exact geometry from docs/design/brand-assets/icons; the
 * remaining entity glyphs are drawn on the same grid. Inline SVG so they
 * inherit currentColor and need no asset pipeline.
 */
import type { CSSProperties, ReactNode } from 'react';

export type GlyphName =
  | 'person' | 'org' | 'role' | 'project' | 'repository' | 'skill' | 'education'
  | 'certification' | 'publication' | 'talk' | 'award' | 'application' | 'event'
  | 'interaction' | 'task' | 'goal' | 'habit' | 'journal' | 'idea' | 'link'
  | 'document' | 'location' | 'trip' | 'media' | 'capture' | 'search' | 'graph'
  | 'timeline' | 'map' | 'calendar' | 'export' | 'filter' | 'tag' | 'merge'
  | 'adjust' | 'trash' | 'today' | 'ask' | 'resume' | 'bell' | 'pin' | 'dot'
  | 'check' | 'chevron-down' | 'plus' | 'close' | 'edit' | 'signout' | 'alert';

/**
 * Official brand icons, geometry copied verbatim from
 * docs/design/brand-assets/icons/*.svg (24px grid, 1.6px stroke).
 * Fixed fills map to tokens: accent → var(--ae-accent), knockout → var(--ae-bg).
 */
const BRAND: Partial<Record<GlyphName, ReactNode>> = {
  capture: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" />
    </>
  ),
  graph: (
    <>
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <circle cx="12" cy="6" r="2.4" />
      <line x1="11" y1="7.6" x2="7" y2="15.2" />
      <line x1="13" y1="7.6" x2="17" y2="15.2" />
    </>
  ),
  timeline: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="12" r="2" fill="var(--ae-accent, #FAFAF8)" stroke="none" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20 a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  org: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="1.6" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      <line x1="9" y1="3" x2="9" y2="7" />
      <line x1="15" y1="3" x2="15" y2="7" />
    </>
  ),
  map: (
    <>
      <circle cx="12" cy="9" r="5" />
      <circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <line x1="12" y1="14" x2="12" y2="20" />
    </>
  ),
  document: (
    <>
      <path d="M6 3 h8 l4 4 v14 h-12 Z" />
      <polyline points="14,3 14,7 18,7" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16.5" x2="15" y2="16.5" />
    </>
  ),
  export: (
    <>
      <path d="M12 15 V4" />
      <polyline points="8,7.5 12,3.5 16,7.5" />
      <path d="M5 14 v4 a2 2 0 0 0 2 2 h10 a2 2 0 0 0 2 -2 v-4" />
    </>
  ),
  filter: <polygon points="4,5 20,5 14,12 14,19 10,17 10,12" />,
  tag: (
    <>
      <line x1="7" y1="9.5" x2="17" y2="9.5" />
      <line x1="7" y1="14.5" x2="17" y2="14.5" />
      <line x1="10.5" y1="5" x2="8.5" y2="19" />
      <line x1="15.5" y1="5" x2="13.5" y2="19" />
    </>
  ),
  award: <path d="M12 3 L13.7 9.4 L20 12 L13.7 14.6 L12 21 L10.3 14.6 L4 12 L10.3 9.4 Z" />,
  merge: (
    <>
      <path d="M6 4 L12 11.5" />
      <path d="M18 4 L12 11.5" />
      <line x1="12" y1="11.5" x2="12" y2="20" />
    </>
  ),
  adjust: (
    <>
      <line x1="4" y1="8.5" x2="20" y2="8.5" />
      <line x1="4" y1="15.5" x2="20" y2="15.5" />
      <circle cx="9" cy="8.5" r="2.4" fill="var(--ae-bg, #0F0F0F)" />
      <circle cx="15" cy="15.5" r="2.4" fill="var(--ae-bg, #0F0F0F)" />
    </>
  ),
  trash: (
    <>
      <polyline points="5,7 19,7" />
      <path d="M7 7 l1 12 a1 1 0 0 0 1 1 h6 a1 1 0 0 0 1 -1 l1 -12" />
      <path d="M9.5 7 v-2 a1 1 0 0 1 1 -1 h3 a1 1 0 0 1 1 1 v2" />
    </>
  ),
};

/** Custom entity glyphs on the same 24px / 1.6 stroke grid. */
const P: Partial<Record<GlyphName, string>> = {
  role: 'M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M4 7h16v13H4zM4 12h16',
  project: 'M3 7l9-4 9 4-9 4-9-4zM3 7v6l9 4 9-4V7M3 13v4l9 4 9-4v-4',
  repository: 'M6 3v13a2 2 0 002 2h10M6 3a2 2 0 00-2 2v11a2 2 0 002 2M18 3v18M8 7h6',
  skill: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
  education: 'M12 4L2 9l10 5 10-5-10-5zM6 11v5c0 1 2.7 3 6 3s6-2 6-3v-5',
  certification: 'M12 3l7 4v5c0 4-3 6-7 8-4-2-7-4-7-8V7zM9 11l2 2 4-4',
  publication: 'M4 5h10v14H4zM14 7h6v12h-6M7 9h4M7 12h4',
  talk: 'M4 4h16v11H9l-4 4v-4H4zM8 9h8M8 12h5',
  application: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 16h7',
  event: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  interaction: 'M4 5h16v10H8l-4 4V5zM8 9h8M8 12h4',
  task: 'M5 6h14M5 12h14M5 18h14M2.5 6l1 1 1.5-2M2.5 12l1 1 1.5-2',
  goal: 'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 12m-5 0a5 5 0 1010 0 5 5 0 10-10 0M12 12h.01',
  habit: 'M4 12a8 8 0 018-8 8 8 0 018 8M20 12a8 8 0 01-8 8 8 8 0 01-8-8M16 4l1 3-3 .5',
  journal: 'M6 3h11a1 1 0 011 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 011-1zM9 8h6M9 11h6',
  idea: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10c1 1 1.5 2 1.5 3h5c0-1 .5-2 1.5-3a6 6 0 00-4-10z',
  link: 'M9 15l6-6M8 12l-2 2a3 3 0 004 4l2-2M16 12l2-2a3 3 0 00-4-4l-2 2',
  location: 'M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11zM12 10m-2 0a2 2 0 104 0 2 2 0 10-4 0',
  trip: 'M3 16l6-2 4 4 2-1-2-8 3-1 2 3 3-1-1 4-4 1-3-1-2 1 1 5-3 1z',
  media: 'M4 5h16v14H4zM10 9l5 3-5 3z',
  today: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4l3 2',
  ask: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 114 2c-1 .7-1.5 1.3-1.5 2.5M12 17h.01',
  resume: 'M6 3h9l4 4v14H6zM14 3v5h5M9 11h4M9 14h6M9 17h6',
  bell: 'M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0',
  pin: 'M9 3h6l-1 6 3 3H7l3-3-1-6zM12 12v9',
  dot: 'M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0',
  check: 'M5 13l4 4 10-11',
  'chevron-down': 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20l1-4L16 5l3 3L8 19zM13 8l3 3',
  signout: 'M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3M16 17l5-5-5-5M21 12H9',
  // The danger mark. The set had none, so every error surface reached for
  // `close`, which is the dismiss control's own glyph: a danger banner drew
  // two identical X marks one gap apart and left colour as the only thing
  // telling the state from the button, the exact failure non-negotiable 6
  // exists to prevent. Same ring as `ask` and `today` with a bar and a dot,
  // so the three read as one family. The bar is a mark, not punctuation; the
  // ban on exclamation marks is a rule about copy.
  alert: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v5M12 16h.01',
};

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
  title?: string;
}

export function Glyph({
  name,
  size = 18,
  strokeWidth = 1.6,
  className,
  style,
  title,
  'aria-hidden': ariaHidden = true,
}: GlyphProps) {
  const brand = BRAND[name];
  const d = brand ? undefined : (P[name] ?? P.dot!);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {brand ??
        d!.split('M').filter(Boolean).map((seg, i) => (
          <path key={i} d={`M${seg}`} />
        ))}
    </svg>
  );
}

/** Map every node type to its glyph (SRS §4.3). */
export const NODE_GLYPH: Record<string, GlyphName> = {
  person: 'person', organization: 'org', role: 'role', project: 'project',
  repository: 'repository', skill: 'skill', education: 'education',
  certification: 'certification', course: 'education', publication: 'publication', talk: 'talk',
  award: 'award', reference: 'talk', job_posting: 'application', application: 'application',
  interview: 'interaction', event: 'event',
  interaction: 'interaction', task: 'task', goal: 'goal', habit: 'habit',
  journal_entry: 'journal', idea: 'idea', link: 'link', document: 'document',
  location: 'location', trip: 'trip', media_item: 'media', highlight: 'idea',
  asset: 'project', health_log: 'habit', account: 'document', subscription: 'calendar',
};

export function glyphForType(type: string): GlyphName {
  return NODE_GLYPH[type] ?? 'dot';
}
