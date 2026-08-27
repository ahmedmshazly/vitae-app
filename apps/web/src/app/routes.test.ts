import { describe, expect, it } from 'vitest';
import { ROUTES, WORKSPACE_NAV, hubForPath, isRouteActive } from './routes.js';

describe('workspace route registry', () => {
  it('keeps Today under its canonical private address', () => {
    expect(ROUTES.today.path).toBe('/today');
    expect(hubForPath('/today')).toBe('today');
    expect(hubForPath('/')).toBeNull();
  });

  it('resolves canonical detail routes and compatibility addresses to the same hub', () => {
    expect(hubForPath('/network/people/person-1')).toBe('network');
    expect(hubForPath('/people/person-1')).toBe('network');
    expect(hubForPath('/career/applications/application-1')).toBe('career');
    expect(hubForPath('/resume/tailor')).toBe('career');
    expect(hubForPath('/explore/atlas')).toBe('explore');
    expect(hubForPath('/data/imports')).toBe('data');
    expect(hubForPath('/this-route-does-not-exist')).toBeNull();
  });

  it('keeps query-backed Network lenses mutually exclusive', () => {
    expect(isRouteActive('/network/intelligence', ROUTES.askPeople, '?lens=contact')).toBe(true);
    expect(isRouteActive('/network/intelligence', ROUTES.intros, '?lens=contact')).toBe(false);
    expect(isRouteActive('/network/intelligence', ROUTES.intros, '?lens=reach')).toBe(true);
  });

  it('marks dossiers as part of their collection while keeping hub roots exact', () => {
    expect(isRouteActive('/career/applications/application-1', ROUTES.applications)).toBe(true);
    expect(isRouteActive('/career/applications', ROUTES.career)).toBe(false);
    expect(isRouteActive('/career/dossiers/dossier-1', ROUTES.dossiers)).toBe(true);
  });

  it('carries evidence dossiers in the Career strip, outside the résumé pipeline', () => {
    // Beside applications rather than inside the résumé run, which is one
    // contiguous pipeline and would read as though a dossier were a step in it.
    expect(WORKSPACE_NAV.career).toContain(ROUTES.dossiers);
    const strip = WORKSPACE_NAV.career;
    expect(strip.indexOf(ROUTES.dossiers)).toBeGreaterThan(strip.indexOf(ROUTES.applications));
    expect(strip.indexOf(ROUTES.dossiers)).toBeLessThan(strip.indexOf(ROUTES.resumeOverview));
  });

  it('exposes every résumé destination in the Career workspace strip', () => {
    expect(WORKSPACE_NAV.career).toContain(ROUTES.resumeTemplates);
  });
});
