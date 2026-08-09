import { useLocation } from 'react-router-dom';
import { Glyph, type GlyphName } from '@vitae/ui';
import { ROUTES } from './routes.js';

interface Crumb {
  parent: string;
  leaf: string;
  glyph: GlyphName;
}

/**
 * Route → breadcrumb map. Keyed by ROUTES.x.path so the path strings live in
 * one place, but leaf/glyph stay hand-tuned here, a breadcrumb wants
 * "Who should I call" where the nav rail says "Ask"; unifying the copy
 * would be a regression, not a cleanup.
 */
function crumbFor(pathname: string): Crumb {
  const exact: Record<string, Crumb> = {
    [ROUTES.today.path]: { parent: '', leaf: 'Today', glyph: 'today' },
    [ROUTES.people.path]: { parent: '', leaf: 'People', glyph: 'person' },
    [ROUTES.orgs.path]: { parent: '', leaf: 'Organizations', glyph: 'org' },
    [ROUTES.askPeople.path]: { parent: 'Ask', leaf: 'Who should I call', glyph: 'ask' },
    [ROUTES.intros.path]: { parent: '', leaf: 'Warm intros', glyph: 'merge' },
    [ROUTES.resumeAtoms.path]: { parent: 'Résumé', leaf: 'Atoms', glyph: 'resume' },
    [ROUTES.resumeTailor.path]: { parent: 'Résumé', leaf: 'Tailoring workspace', glyph: 'resume' },
    [ROUTES.resumeOutputs.path]: { parent: 'Résumé', leaf: 'Outputs', glyph: 'resume' },
    [ROUTES.resumeLetters.path]: { parent: 'Résumé', leaf: 'Cover letters', glyph: 'resume' },
    [ROUTES.resumeTemplates.path]: { parent: 'Résumé', leaf: 'Templates', glyph: 'resume' },
    [ROUTES.collections.path]: { parent: '', leaf: 'Collections', glyph: 'filter' },
    [ROUTES.graph.path]: { parent: '', leaf: 'Life map', glyph: 'graph' },
    [ROUTES.timeline.path]: { parent: '', leaf: 'Chronograph', glyph: 'timeline' },
    [ROUTES.map.path]: { parent: '', leaf: 'Atlas', glyph: 'map' },
    [ROUTES.import.path]: { parent: '', leaf: 'Import', glyph: 'export' },
    '/import/duplicates': { parent: 'Import', leaf: 'Duplicates', glyph: 'merge' },
    [ROUTES.export.path]: { parent: '', leaf: 'Export & backup', glyph: 'export' },
    '/search': { parent: '', leaf: 'Search', glyph: 'search' },
    [ROUTES.trash.path]: { parent: '', leaf: 'Trash', glyph: 'trash' },
    [ROUTES.settings.path]: { parent: '', leaf: 'Settings', glyph: 'adjust' },
  };
  if (exact[pathname]) return exact[pathname];
  if (pathname.startsWith(`${ROUTES.people.path}/`)) return { parent: 'People', leaf: 'Profile', glyph: 'person' };
  if (pathname.startsWith(`${ROUTES.orgs.path}/`)) return { parent: 'Organizations', leaf: 'Profile', glyph: 'org' };
  if (pathname.startsWith('/n/')) return { parent: 'Collections', leaf: 'Record', glyph: 'document' };
  if (pathname.startsWith('/browse/')) {
    const type = pathname.split('/')[2] ?? '';
    return { parent: 'Collections', leaf: type.replace(/_/g, ' '), glyph: 'filter' };
  }
  return { parent: '', leaf: 'Today', glyph: 'today' };
}

export function Breadcrumb() {
  const { pathname } = useLocation();
  const { parent, leaf, glyph } = crumbFor(pathname);
  return (
    <div className="topbar__crumb">
      <Glyph name={glyph} size={15} />
      {parent && (
        <>
          <span>{parent}</span>
          <span className="topbar__crumb-sep">/</span>
        </>
      )}
      <span className="cur" style={{ textTransform: pathname.startsWith('/browse/') ? 'capitalize' : undefined }}>
        {leaf}
      </span>
    </div>
  );
}
