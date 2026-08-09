/**
 * Command-palette action registry. The ⌘P palette shows these alongside record
 * jumps so the app's capabilities are discoverable by name ("New résumé",
 * "Sync GitHub") instead of buried in the nav.
 */
import type { GlyphName } from '@vitae/ui';
import { ROUTES } from './routes.js';

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  glyph?: GlyphName;
  /** Extra words to match on beyond the label. */
  keywords?: string;
  run: () => void;
}

export interface CommandDeps {
  navigate: (to: string) => void;
  openCapture: () => void;
  openNew: () => void;
  toggleSpace?: () => void;
  space?: 'real' | 'demo';
}

/** Build the action list from the handlers the Shell owns. */
export function buildCommands({ navigate, openCapture, openNew, toggleSpace, space }: CommandDeps): CommandAction[] {
  const go = (to: string) => () => navigate(to);
  return [
    ...(toggleSpace
      ? [
          {
            id: 'toggle-space',
            label: space === 'demo' ? 'Switch to my real data' : 'Switch to demo data',
            glyph: 'adjust' as GlyphName,
            keywords: 'demo sample real space mode view toggle',
            run: toggleSpace,
          },
        ]
      : []),
    { id: 'new-record', label: 'New record…', hint: 'n', glyph: 'plus', keywords: 'create add entity', run: openNew },
    { id: 'capture', label: 'Quick capture…', hint: '⌘K', glyph: 'capture', keywords: 'add note', run: openCapture },
    { id: 'new-resume', label: 'New résumé', glyph: ROUTES.resumeTailor.glyph, keywords: 'tailor cv job application build make', run: go(ROUTES.resumeTailor.path) },
    { id: 'cover-letters', label: 'Cover letters', glyph: ROUTES.resumeLetters.glyph, keywords: 'letter draft hook closer application', run: go(ROUTES.resumeLetters.path) },
    { id: 'resume-hub', label: 'Go to Résumé', glyph: ROUTES.resumeOverview.glyph, keywords: 'cv outputs atoms templates letters', run: go(ROUTES.resumeOverview.path) },
    { id: 'sync-github', label: 'Sync GitHub repositories', glyph: ROUTES.repositories.glyph, keywords: 'import repos connect', run: go(ROUTES.repositories.path) },
    { id: 'repos', label: 'Go to Repositories', glyph: ROUTES.repositories.glyph, keywords: 'github projects code', run: go(ROUTES.repositories.path) },
    { id: 'ask', label: 'Who should I call?', glyph: ROUTES.askPeople.glyph, keywords: 'reconnect crm reach out', run: go(ROUTES.askPeople.path) },
    { id: 'graph', label: 'Open Life map', glyph: ROUTES.graph.glyph, keywords: 'network explore graph', run: go(ROUTES.graph.path) },
    { id: 'timeline', label: 'Open Chronograph', glyph: ROUTES.timeline.glyph, keywords: 'history chronology timeline', run: go(ROUTES.timeline.path) },
    { id: 'map', label: 'Open Atlas', glyph: ROUTES.map.glyph, keywords: 'places locations map', run: go(ROUTES.map.path) },
    { id: 'import', label: 'Import data', glyph: ROUTES.import.glyph, keywords: 'github linkedin csv vcard', run: go(ROUTES.import.path) },
    { id: 'export', label: 'Export & backup', glyph: ROUTES.export.glyph, keywords: 'download backup archive', run: go(ROUTES.export.path) },
    { id: 'people', label: 'Go to People', glyph: ROUTES.people.glyph, keywords: 'contacts crm', run: go(ROUTES.people.path) },
    { id: 'orgs', label: 'Go to Organizations', glyph: ROUTES.orgs.glyph, keywords: 'companies', run: go(ROUTES.orgs.path) },
    { id: 'collections', label: 'Go to Collections', glyph: ROUTES.collections.glyph, keywords: 'saved views filter', run: go(ROUTES.collections.path) },
    { id: 'settings', label: 'Open Settings', glyph: ROUTES.settings.glyph, keywords: 'preferences github token ranking', run: go(ROUTES.settings.path) },
    { id: 'trash', label: 'Open Trash', glyph: ROUTES.trash.glyph, keywords: 'deleted restore', run: go(ROUTES.trash.path) },
  ];
}

/** Lowercase + strip diacritics so "resume" matches "résumé". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Accent-insensitive, token-AND substring match over label + keywords. */
export function matchCommand(a: CommandAction, q: string): boolean {
  const hay = fold(`${a.label} ${a.keywords ?? ''}`);
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}
