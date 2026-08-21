import { describe, expect, it } from 'vitest';
import { ROUTES, WORKSPACE_NAV, hubForPath, isRouteActive } from './routes.js';

describe('workspace route registry', () => {
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
  });

  it('exposes every résumé destination in the Career workspace strip', () => {
    expect(WORKSPACE_NAV.career).toContain(ROUTES.resumeTemplates);
  });
});
