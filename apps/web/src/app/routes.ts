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
  ledger: { path: '/today/ledger', label: 'Ledger', glyph: 'journal', hub: 'today' },
  tasks: { path: '/today/tasks', label: 'Tasks', glyph: 'task', hub: 'today' },
  waiting: { path: '/today/waiting', label: 'Waiting', glyph: 'bell', hub: 'today' },
  review: { path: '/today/review', label: 'Review', glyph: 'check', hub: 'today' },
  analytics: { path: '/today/analytics', label: 'Analytics', glyph: 'graph', hub: 'today' },
  automation: { path: '/today/automation', label: 'Automation', glyph: 'adjust', hub: 'today' },
  taskTemplates: {
    path: '/today/task-templates',
    label: 'Task templates',
    glyph: 'adjust',
    hub: 'today',
  },

  network: { path: '/network', label: 'Network', glyph: 'person', hub: 'network', end: true },
  correspondence: {
    path: '/network/correspondence',
    label: 'Correspondence',
    glyph: 'interaction',
    hub: 'network',
  },
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
  dossiers: {
    path: '/career/dossiers',
    label: 'Dossiers',
    glyph: 'document',
    hub: 'career',
    keywords: 'evidence provenance appendix promotion petition exhibits background packet',
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
  knowledge: {
    path: '/data/knowledge',
    label: 'Knowledge review',
    shortLabel: 'Review',
    glyph: 'document',
    hub: 'data',
  },
  duplicates: {
    path: '/data/identity',
    label: 'Identity audit',
    shortLabel: 'Identity',
    glyph: 'merge',
    hub: 'data',
  },
  repositories: { path: '/data/sources/github', label: 'GitHub', glyph: 'repository', hub: 'data' },
  gemini: { path: '/data/sources/gemini', label: 'Gemini', glyph: 'idea', hub: 'data' },
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

/**
 * Flagged Today extras. Always registered on `ROUTES` so a bookmark is not a
 * silent 404; the shell and command palette omit them unless the web flag is on.
 */
export const PRODUCTIVITY_TODAY_NAV: RouteEntry[] = [
  ROUTES.tasks,
  ROUTES.waiting,
  ROUTES.review,
  ROUTES.analytics,
  ROUTES.automation,
  ROUTES.taskTemplates,
];

export const WORKSPACE_NAV: Record<HubId, RouteEntry[]> = {
  today: [ROUTES.today, ROUTES.planner, ROUTES.ledger],
  network: [
    ROUTES.network,
    ROUTES.people,
    ROUTES.orgs,
    ROUTES.askPeople,
    ROUTES.intros,
    ROUTES.correspondence,
  ],
  career: [
    ROUTES.career,
    ROUTES.applications,
    // Beside applications rather than inside the résumé run: a dossier is a
    // document addressed to an audience, and the résumé entries below it are
    // one continuous pipeline that reads wrong with something else in it.
    ROUTES.dossiers,
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
    ROUTES.knowledge,
    ROUTES.duplicates,
    ROUTES.repositories,
    ROUTES.gemini,
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

/** A route root only owns itself and slash-delimited descendants.
 *
 * This is intentionally narrower than `startsWith`: a typo such as
 * `/resume-builder` is not a Career address, and `/todayish` is not Today.
 * The 404 uses this result to offer a likely workspace, so an over-broad
 * prefix would turn an unknown route into an unsupported recommendation.
 */
function ownsPath(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** Resolve both canonical paths and every supported compatibility URL. */
export function hubForPath(pathname: string): HubId | null {
  if (ownsPath(pathname, '/today')) return 'today';
  if (
    ownsPath(pathname, '/network') ||
    ownsPath(pathname, '/people') ||
    ownsPath(pathname, '/orgs') ||
    ownsPath(pathname, '/ask') ||
    ownsPath(pathname, '/intros')
  )
    return 'network';
  if (ownsPath(pathname, '/career') || ownsPath(pathname, '/resume')) return 'career';
  if (
    ownsPath(pathname, '/explore') ||
    ownsPath(pathname, '/collections') ||
    ownsPath(pathname, '/search') ||
    ownsPath(pathname, '/browse') ||
    pathname.startsWith('/n/') ||
    ownsPath(pathname, '/graph') ||
    ownsPath(pathname, '/timeline') ||
    ownsPath(pathname, '/map')
  )
    return 'explore';
  if (
    ownsPath(pathname, '/data') ||
    ownsPath(pathname, '/import') ||
    ownsPath(pathname, '/repositories') ||
    ownsPath(pathname, '/export') ||
    ownsPath(pathname, '/trash')
  )
    return 'data';
  if (ownsPath(pathname, '/settings')) return 'settings';
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

/** Strip the shell actually paints: billing only on Cloud, productivity only when flagged. */
export function visibleWorkspaceNav(
  hub: HubId,
  opts: { cloudEnabled?: boolean; productivityEnabled?: boolean } = {},
): RouteEntry[] {
  const { cloudEnabled = false, productivityEnabled = false } = opts;
  const extra = hub === 'today' && productivityEnabled ? PRODUCTIVITY_TODAY_NAV : [];
  return [...WORKSPACE_NAV[hub], ...extra].filter(
    (route) => cloudEnabled || route.path !== ROUTES.settingsBilling.path,
  );
}
