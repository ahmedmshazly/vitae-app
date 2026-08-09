import { describe, expect, it } from 'vitest';
import { entityHref, entityListHref, typeLabel } from './entity-href.js';

describe('entityHref', () => {
  it('routes people and orgs to CRM hubs', () => {
    expect(entityHref('person', 'a')).toBe('/people/a');
    expect(entityHref('organization', 'b')).toBe('/orgs/b');
    expect(entityHref('role', 'c')).toBe('/n/c');
  });
});

describe('entityListHref', () => {
  it('keeps people, orgs, and repositories special', () => {
    expect(entityListHref('person')).toBe('/people');
    expect(entityListHref('organization')).toBe('/orgs');
    expect(entityListHref('repository')).toBe('/repositories');
    expect(entityListHref('skill')).toBe('/browse/skill');
  });
});

describe('typeLabel', () => {
  it('humanizes snake_case', () => {
    expect(typeLabel('job_posting')).toBe('job posting');
  });
});
