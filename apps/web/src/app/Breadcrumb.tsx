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
    [ROUTES.planner.path]: { parent: 'Today', leaf: 'Planner', glyph: 'calendar' },
    [ROUTES.ledger.path]: { parent: 'Today', leaf: 'Ledger', glyph: 'journal' },
    [ROUTES.tasks.path]: { parent: 'Today', leaf: 'Tasks', glyph: 'task' },
    [ROUTES.waiting.path]: { parent: 'Today', leaf: 'Waiting', glyph: 'bell' },
    [ROUTES.review.path]: { parent: 'Today', leaf: 'Review', glyph: 'check' },
    [ROUTES.analytics.path]: { parent: 'Today', leaf: 'Analytics', glyph: 'graph' },
    [ROUTES.automation.path]: { parent: 'Today', leaf: 'Automation', glyph: 'adjust' },
    [ROUTES.taskTemplates.path]: { parent: 'Today', leaf: 'Task templates', glyph: 'adjust' },
    [ROUTES.network.path]: { parent: '', leaf: 'Network', glyph: 'person' },
    [ROUTES.correspondence.path]: { parent: 'Network', leaf: 'Correspondence', glyph: 'interaction' },
    [ROUTES.people.path]: { parent: 'Network', leaf: 'People', glyph: 'person' },
    [ROUTES.orgs.path]: { parent: 'Network', leaf: 'Organizations', glyph: 'org' },
    '/network/intelligence': { parent: 'Network', leaf: 'Intelligence', glyph: 'ask' },
    [ROUTES.career.path]: { parent: '', leaf: 'Career', glyph: 'application' },
    [ROUTES.applications.path]: { parent: 'Career', leaf: 'Applications', glyph: 'application' },
    [ROUTES.dossiers.path]: { parent: 'Career', leaf: 'Dossiers', glyph: 'document' },
    [ROUTES.resumeOverview.path]: { parent: 'Career', leaf: 'Résumé', glyph: 'resume' },
    [ROUTES.resumeAtoms.path]: { parent: 'Résumé', leaf: 'Evidence', glyph: 'document' },
    [ROUTES.resumeTailor.path]: { parent: 'Résumé', leaf: 'Tailoring workspace', glyph: 'resume' },
    [ROUTES.resumeOutputs.path]: { parent: 'Résumé', leaf: 'Outputs', glyph: 'resume' },
    [ROUTES.resumeLetters.path]: { parent: 'Résumé', leaf: 'Cover letters', glyph: 'document' },
    [ROUTES.resumeTemplates.path]: { parent: 'Résumé', leaf: 'Templates', glyph: 'adjust' },
    [ROUTES.explore.path]: { parent: '', leaf: 'Explore', glyph: 'graph' },
    [ROUTES.collections.path]: { parent: 'Explore', leaf: 'Library', glyph: 'filter' },
    [ROUTES.graph.path]: { parent: 'Explore', leaf: 'Life map', glyph: 'graph' },
    [ROUTES.timeline.path]: { parent: 'Explore', leaf: 'Chronograph', glyph: 'timeline' },
    [ROUTES.map.path]: { parent: 'Explore', leaf: 'Atlas', glyph: 'map' },
    [ROUTES.data.path]: { parent: '', leaf: 'Data', glyph: 'capture' },
    [ROUTES.import.path]: { parent: 'Data', leaf: 'Imports', glyph: 'capture' },
    [ROUTES.duplicates.path]: { parent: 'Data', leaf: 'Identity audit', glyph: 'merge' },
    [ROUTES.repositories.path]: { parent: 'Data', leaf: 'GitHub', glyph: 'repository' },
    [ROUTES.gemini.path]: { parent: 'Data', leaf: 'Gemini', glyph: 'idea' },
    [ROUTES.export.path]: { parent: 'Data', leaf: 'Exports & backups', glyph: 'export' },
    [ROUTES.trash.path]: { parent: 'Data', leaf: 'Trash', glyph: 'trash' },
    [ROUTES.settingsProfile.path]: { parent: 'Settings', leaf: 'Profile', glyph: 'person' },
    [ROUTES.settingsPreferences.path]: { parent: 'Settings', leaf: 'Preferences', glyph: 'adjust' },
    [ROUTES.settingsSystem.path]: { parent: 'Settings', leaf: 'System', glyph: 'graph' },
    [ROUTES.settingsBilling.path]: { parent: 'Settings', leaf: 'Billing & access', glyph: 'export' },
    '/help': { parent: '', leaf: 'Help & shortcuts', glyph: 'ask' },

    // Compatibility addresses keep the labels their existing tests and saved
    // links announced, while the canonical paths above expose the new IA.
    '/people': { parent: '', leaf: 'People', glyph: 'person' },
    '/orgs': { parent: '', leaf: 'Organizations', glyph: 'org' },
    '/ask/people': { parent: 'Ask', leaf: 'Who should I call', glyph: 'ask' },
    '/intros': { parent: '', leaf: 'Warm intros', glyph: 'merge' },
    '/resume/atoms': { parent: 'Résumé', leaf: 'Atoms', glyph: 'resume' },
    '/resume/tailor': { parent: 'Résumé', leaf: 'Tailoring workspace', glyph: 'resume' },
    '/resume/outputs': { parent: 'Résumé', leaf: 'Outputs', glyph: 'resume' },
    '/resume/letters': { parent: 'Résumé', leaf: 'Cover letters', glyph: 'resume' },
    '/resume/templates': { parent: 'Résumé', leaf: 'Templates', glyph: 'resume' },
    '/collections': { parent: '', leaf: 'Collections', glyph: 'filter' },
    '/graph': { parent: '', leaf: 'Life map', glyph: 'graph' },
    '/timeline': { parent: '', leaf: 'Chronograph', glyph: 'timeline' },
    '/map': { parent: '', leaf: 'Atlas', glyph: 'map' },
    '/import': { parent: '', leaf: 'Import', glyph: 'export' },
    '/import/duplicates': { parent: 'Import', leaf: 'Duplicates', glyph: 'merge' },
    '/export': { parent: '', leaf: 'Export & backup', glyph: 'export' },
    '/search': { parent: '', leaf: 'Search', glyph: 'search' },
    '/trash': { parent: '', leaf: 'Trash', glyph: 'trash' },
    [ROUTES.settings.path]: { parent: '', leaf: 'Settings', glyph: 'adjust' },
    // Reachable routes that had no crumb and so fell through to "Today".
    '/resume': { parent: '', leaf: 'Résumé', glyph: 'resume' },
    '/repositories': { parent: '', leaf: 'Repositories', glyph: 'repository' },
    // No '/reference/entities' crumb: that route mounts outside Shell on
    // purpose, so a crumb for it could never render. See DESIGN.md.
  };
  if (exact[pathname]) return exact[pathname];
  if (pathname.startsWith(`${ROUTES.people.path}/`))
    return { parent: 'Network / People', leaf: 'Profile', glyph: 'person' };
  if (pathname.startsWith(`${ROUTES.orgs.path}/`))
    return { parent: 'Network / Organizations', leaf: 'Profile', glyph: 'org' };
  // This leaf used to read "Dossier", which was fine while it was the only
  // thing in the product with that name. It is not: an evidence dossier is a
  // different object with its own screens, and two unrelated records answering
  // to one crumb is a way to be lost while the breadcrumb reads correctly.
  if (pathname.startsWith(`${ROUTES.applications.path}/`))
    return { parent: 'Career / Applications', leaf: 'Application', glyph: 'application' };
  if (pathname.startsWith(`${ROUTES.dossiers.path}/`))
    return { parent: 'Career / Dossiers', leaf: 'Dossier', glyph: 'document' };
  if (pathname.startsWith('/people/'))
    return { parent: 'People', leaf: 'Profile', glyph: 'person' };
  if (pathname.startsWith('/orgs/'))
    return { parent: 'Organizations', leaf: 'Profile', glyph: 'org' };
  if (pathname.startsWith('/n/'))
    return { parent: 'Collections', leaf: 'Record', glyph: 'document' };
  if (pathname.startsWith('/browse/')) {
    const type = pathname.split('/')[2] ?? '';
    return { parent: 'Collections', leaf: type.replace(/_/g, ' '), glyph: 'filter' };
  }
  // Anything left is a URL that matches no route. It used to report "Today",
  // which paired with the catch-all rendering the Dashboard to make a broken
  // link indistinguishable from a successful navigation home. Both halves of
  // that now say the same true thing.
  return { parent: '', leaf: 'Not found', glyph: 'search' };
}

/** Exported so the shell can announce the same page name it displays, rather
 *  than deriving a second, drifting vocabulary for the same routes. */
export { crumbFor };

export function Breadcrumb() {
  const { pathname } = useLocation();
  const { parent, leaf, glyph } = crumbFor(pathname);
  return (
    <div className="topbar__crumb" title={parent ? `${parent} / ${leaf}` : leaf}>
      <Glyph name={glyph} size={15} />
      {parent && (
        <>
          <span>{parent}</span>
          <span className="topbar__crumb-sep">/</span>
        </>
      )}
      <span
        className="cur"
        style={{ textTransform: pathname.startsWith('/browse/') ? 'capitalize' : undefined }}
      >
        {leaf}
      </span>
    </div>
  );
}
