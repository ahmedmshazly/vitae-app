import { describe, expect, it, vi } from 'vitest';
import { entityHref, entityListHref, typeLabel } from './entity-href.js';

const flag = vi.hoisted(() => ({ enabled: false }));
vi.mock('./productivity-flag.js', () => ({
  isProductivityEnabled: () => flag.enabled,
  PRODUCTIVITY_WEB_FLAG: 'VITE_PUBLIC_PRODUCTIVITY_ENABLED',
}));

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

  it('sends the task list to Today when productivity is on', () => {
    flag.enabled = false;
    expect(entityListHref('task')).toBe('/browse/task');
    flag.enabled = true;
    expect(entityListHref('task')).toBe('/today/tasks');
    expect(entityHref('task', 'task-1')).toBe('/n/task-1');
  });
});

describe('typeLabel', () => {
  it('humanizes snake_case', () => {
    expect(typeLabel('job_posting')).toBe('job posting');
  });
});
