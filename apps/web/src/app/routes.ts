/**
 * Single source of truth for the app's navigable routes: path, glyph, and
 * the canonical nav label. Consumed directly by Shell.tsx's nav rail and
 * mobile dock. Breadcrumb.tsx and commands.ts reference `ROUTES.x.path` to
 * kill the repeated path-string literals (the actual duplication risk:
 * five files independently typing '/resume/atoms'), but keep their own
 * hand-tuned copy: a breadcrumb leaf ("Who should I call") and a
 * command-palette label ("Open Life map") are deliberately different phrasings
 * of the same destination, not the same string in five places.
 *
 * apps/web/src/App.tsx's <Route> JSX is NOT generated from this manifest.
 * It already is the single source of truth for path<->element pairing,
 * including lazy-loading and redirect special cases this flat data shape
 * can't express without losing them.
 */
import type { GlyphName } from '@vitae/ui';

export type RouteSection = 'top' | 'resume' | 'library' | 'bottom';

export interface RouteEntry {
  path: string;
  label: string;
  glyph: GlyphName;
  section: RouteSection;
  /** NavLink `end`: only matches the exact path, not sub-routes. */
  end?: boolean;
}

export const ROUTES = {
  today: { path: '/', label: 'Today', glyph: 'today', section: 'top', end: true },
  people: { path: '/people', label: 'People', glyph: 'person', section: 'top' },
  orgs: { path: '/orgs', label: 'Organizations', glyph: 'org', section: 'top' },
  askPeople: { path: '/ask/people', label: 'Ask', glyph: 'ask', section: 'top' },
  intros: { path: '/intros', label: 'Intros', glyph: 'merge', section: 'top' },

  resumeOverview: { path: '/resume', label: 'Overview', glyph: 'resume', section: 'resume' },
  resumeTailor: { path: '/resume/tailor', label: 'Tailor', glyph: 'resume', section: 'resume' },
  resumeAtoms: { path: '/resume/atoms', label: 'Atoms', glyph: 'document', section: 'resume' },
  resumeOutputs: { path: '/resume/outputs', label: 'Outputs', glyph: 'export', section: 'resume' },
  resumeLetters: { path: '/resume/letters', label: 'Letters', glyph: 'resume', section: 'resume' },
  resumeTemplates: {
    path: '/resume/templates',
    label: 'Templates',
    glyph: 'resume',
    section: 'resume',
  },

  collections: { path: '/collections', label: 'Collections', glyph: 'filter', section: 'library' },
  repositories: {
    path: '/repositories',
    label: 'Repositories',
    glyph: 'repository',
    section: 'library',
  },
  graph: { path: '/graph', label: 'Life map', glyph: 'graph', section: 'library' },
  timeline: { path: '/timeline', label: 'Chronograph', glyph: 'timeline', section: 'library' },
  map: { path: '/map', label: 'Atlas', glyph: 'map', section: 'library' },
  import: { path: '/import', label: 'Import', glyph: 'capture', section: 'library' },
  export: { path: '/export', label: 'Export', glyph: 'export', section: 'library' },

  trash: { path: '/trash', label: 'Trash', glyph: 'trash', section: 'bottom' },
  settings: { path: '/settings', label: 'Settings', glyph: 'adjust', section: 'bottom' },
} as const satisfies Record<string, RouteEntry>;

export type RouteId = keyof typeof ROUTES;

export function routesBySection(section: RouteSection): RouteEntry[] {
  return Object.values(ROUTES).filter((r) => r.section === section);
}
