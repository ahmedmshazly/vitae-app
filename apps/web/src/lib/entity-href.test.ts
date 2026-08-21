import { describe, expect, it } from 'vitest';
import { entityHref, entityListHref, typeLabel } from './entity-href.js';

describe('entityHref', () => {
  it('routes people and orgs to CRM hubs', () => {
    expect(entityHref('person', 'a')).toBe('/network/people/a');
    expect(entityHref('organization', 'b')).toBe('/network/organizations/b');
    expect(entityHref('application', 'd')).toBe('/career/applications/d');
    expect(entityHref('role', 'c')).toBe('/n/c');
  });
});

describe('entityListHref', () => {
  it('keeps people, orgs, and repositories special', () => {
    expect(entityListHref('person')).toBe('/network/people');
    expect(entityListHref('organization')).toBe('/network/organizations');
    expect(entityListHref('repository')).toBe('/data/sources/github');
    expect(entityListHref('skill')).toBe('/browse/skill');
  });
});

describe('typeLabel', () => {
  it('humanizes snake_case', () => {
    expect(typeLabel('job_posting')).toBe('job posting');
  });
});
