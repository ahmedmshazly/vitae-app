/**
 * The application map in one typed registry.
 *
 * `App.tsx` owns component loading; this file owns the language and topology
 * the shell, workspace strip, breadcrumbs, and command palette expose. Legacy
 * URLs remain mounted in App.tsx, but all new navigation points at these
 * canonical, task-led paths.
 */
import type { GlyphName } from '@vitae/ui';

export type HubId = 'today' | 'network' | 'career' | 'explore' | 'data' | 'settings';

export interface RouteEntry {
  path: string;
  label: string;
  shortLabel?: string;
  glyph: GlyphName;
  hub: HubId;
  end?: boolean;
  keywords?: string;
}

export interface HubEntry extends RouteEntry {
  id: HubId;
  description: string;
}

export const ROUTES = {
  today: { path: '/today', label: 'Today', glyph: 'today', hub: 'today', end: true },
  planner: { path: '/today/planner', label: 'Planner', glyph: 'calendar', hub: 'today' },

  network: { path: '/network', label: 'Network', glyph: 'person', hub: 'network', end: true },
  people: { path: '/network/people', label: 'People', glyph: 'person', hub: 'network' },
  orgs: {
    path: '/network/organizations',
    label: 'Organizations',
    shortLabel: 'Orgs',
    glyph: 'org',
    hub: 'network',
  },
  askPeople: {
    path: '/network/intelligence?lens=contact',
    label: 'Who to contact',
    shortLabel: 'Contact',
    glyph: 'ask',
    hub: 'network',
  },
  intros: {
    path: '/network/intelligence?lens=reach',
    label: 'Warm paths',
    shortLabel: 'Reach',
    glyph: 'merge',
    hub: 'network',
  },

  career: { path: '/career', label: 'Career', glyph: 'application', hub: 'career', end: true },
  applications: {
    path: '/career/applications',
    label: 'Applications',
    glyph: 'application',
    hub: 'career',
  },
  resumeOverview: {
    path: '/career/resume',
    label: 'Résumé',
    glyph: 'resume',
    hub: 'career',
    end: true,
  },
  resumeAtoms: {
    path: '/career/resume/evidence',
    label: 'Evidence',
    glyph: 'document',
    hub: 'career',
  },
  resumeTailor: { path: '/career/resume/tailor', label: 'Tailor', glyph: 'resume', hub: 'career' },
  resumeOutputs: {
    path: '/career/resume/outputs',
    label: 'Outputs',
    glyph: 'export',
    hub: 'career',
  },
  resumeLetters: {
    path: '/career/resume/letters',
    label: 'Letters',
    glyph: 'document',
    hub: 'career',
  },
  resumeTemplates: {
    path: '/career/resume/templates',
    label: 'Templates',
    glyph: 'adjust',
    hub: 'career',
  },

  explore: { path: '/explore', label: 'Explore', glyph: 'graph', hub: 'explore', end: true },
  collections: { path: '/explore/library', label: 'Library', glyph: 'filter', hub: 'explore' },
  graph: { path: '/explore/graph', label: 'Life map', glyph: 'graph', hub: 'explore' },
  timeline: {
    path: '/explore/timeline',
    label: 'Chronograph',
    shortLabel: 'Time',
    glyph: 'timeline',
    hub: 'explore',
  },
  map: { path: '/explore/atlas', label: 'Atlas', glyph: 'map', hub: 'explore' },

  data: { path: '/data', label: 'Data', glyph: 'capture', hub: 'data', end: true },
  import: { path: '/data/imports', label: 'Imports', glyph: 'capture', hub: 'data' },
  duplicates: {
    path: '/data/identity',
    label: 'Identity audit',
    shortLabel: 'Identity',
    glyph: 'merge',
    hub: 'data',
  },
  repositories: { path: '/data/sources/github', label: 'GitHub', glyph: 'repository', hub: 'data' },
  export: { path: '/data/exports', label: 'Exports', glyph: 'export', hub: 'data' },
  trash: { path: '/data/trash', label: 'Trash', glyph: 'trash', hub: 'data' },

  settings: { path: '/settings', label: 'Settings', glyph: 'adjust', hub: 'settings', end: true },
  settingsProfile: {
    path: '/settings/profile',
    label: 'Profile',
    glyph: 'person',
    hub: 'settings',
  },
  settingsPreferences: {
    path: '/settings/preferences',
    label: 'Preferences',
    glyph: 'adjust',
    hub: 'settings',
  },
  settingsSystem: { path: '/settings/system', label: 'System', glyph: 'graph', hub: 'settings' },
  settingsBilling: {
    path: '/settings/billing',
    label: 'Billing & access',
    glyph: 'export',
    hub: 'settings',
  },
} as const satisfies Record<string, RouteEntry>;

export type RouteId = keyof typeof ROUTES;

export const HUBS: HubEntry[] = [
  { ...ROUTES.today, id: 'today', description: 'Agenda and daily momentum' },
  { ...ROUTES.network, id: 'network', description: 'Relationships and reach' },
  { ...ROUTES.career, id: 'career', description: 'Applications and documents' },
  { ...ROUTES.explore, id: 'explore', description: 'Graph, time, and place' },
  { ...ROUTES.data, id: 'data', description: 'Imports, integrity, and ownership' },
  { ...ROUTES.settings, id: 'settings', description: 'Identity and system controls' },
];

export const WORKSPACE_NAV: Record<HubId, RouteEntry[]> = {
  today: [ROUTES.today, ROUTES.planner],
  network: [ROUTES.network, ROUTES.people, ROUTES.orgs, ROUTES.askPeople, ROUTES.intros],
  career: [
    ROUTES.career,
    ROUTES.applications,
    ROUTES.resumeOverview,
    ROUTES.resumeAtoms,
    ROUTES.resumeTailor,
    ROUTES.resumeOutputs,
    ROUTES.resumeLetters,
    ROUTES.resumeTemplates,
  ],
  explore: [ROUTES.explore, ROUTES.collections, ROUTES.graph, ROUTES.timeline, ROUTES.map],
  data: [
    ROUTES.data,
    ROUTES.import,
    ROUTES.duplicates,
    ROUTES.repositories,
    ROUTES.export,
    ROUTES.trash,
  ],
  settings: [
    ROUTES.settings,
    ROUTES.settingsProfile,
    ROUTES.settingsPreferences,
    ROUTES.settingsSystem,
    // Shown only on Cloud builds; the shell filters it out when the hosted
    // plane is off, because a self-hosted install redirects billing away.
    ROUTES.settingsBilling,
  ],
};

/** Resolve both canonical paths and every supported compatibility URL. */
export function hubForPath(pathname: string): HubId | null {
  if (pathname === '/today' || pathname.startsWith('/today/')) return 'today';
  if (
    pathname.startsWith('/network') ||
    pathname.startsWith('/people') ||
    pathname.startsWith('/orgs') ||
    pathname.startsWith('/ask') ||
    pathname.startsWith('/intros')
  )
    return 'network';
  if (pathname.startsWith('/career') || pathname.startsWith('/resume')) return 'career';
  if (
    pathname.startsWith('/explore') ||
    pathname.startsWith('/collections') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/browse') ||
    pathname.startsWith('/n/') ||
    pathname.startsWith('/graph') ||
    pathname.startsWith('/timeline') ||
    pathname.startsWith('/map')
  )
    return 'explore';
  if (
    pathname.startsWith('/data') ||
    pathname.startsWith('/import') ||
    pathname.startsWith('/repositories') ||
    pathname.startsWith('/export') ||
    pathname.startsWith('/trash')
  )
    return 'data';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}

export function isRouteActive(pathname: string, route: RouteEntry, search = ''): boolean {
  const [path, expectedQuery] = route.path.split('?');
  if (expectedQuery) {
    return (
      pathname === path &&
      new URLSearchParams(search).get('lens') === new URLSearchParams(expectedQuery).get('lens')
    );
  }
  if (route.end) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}
