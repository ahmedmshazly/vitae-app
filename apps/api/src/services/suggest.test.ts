/**
 * Suggestions are served off one cached scan.
 *
 * The read cost is the reason this service exists in this shape: ~96 fields
 * querying at a 140 ms debounce would each have triggered a full collection read
 * under the previous implementation. These tests pin both halves, the values
 * are right, and a burst of typing costs one scan, not one per keystroke.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = '2026-07-31T00:00:00.000Z';
let nodeReads = 0;

const nodes = [
  {
    id: 'org-1',
    type: 'organization',
    title: 'NiaDelta',
    props: { industry: 'Leadership consulting', hq_city: 'San Mateo' },
    created_at: now,
    updated_at: now,
    deleted_at: null,
  },
  {
    id: 'org-2',
    type: 'organization',
    title: 'Goodera',
    props: { industry: 'Leadership consulting', hq_city: 'San Mateo' },
    created_at: now,
    updated_at: now,
    deleted_at: null,
  },
  {
    id: 'org-3',
    type: 'organization',
    title: 'Udacity',
    props: { industry: 'Online education' },
    created_at: now,
    updated_at: now,
    deleted_at: null,
  },
  {
    id: 'skill-1',
    type: 'skill',
    title: 'Python',
    props: { aliases: ['py'] },
    created_at: now,
    updated_at: now,
    deleted_at: null,
  },
  {
    id: 'role-1',
    type: 'role',
    title: 'Intern',
    props: { city: 'Kigali', team: 'Data' },
    created_at: now,
    updated_at: now,
    deleted_at: null,
  },
];

const edges = [
  { id: 'e1', type: 'KNOWS', src: 'a', dst: 'b', props: { met_via: 'a conference' }, deleted_at: null },
  { id: 'e2', type: 'KNOWS', src: 'a', dst: 'c', props: { met_via: 'a conference' }, deleted_at: null },
];

vi.mock('../db/repository.js', () => ({
  repository: {
    allLiveNodes: vi.fn(async () => {
      nodeReads += 1;
      return nodes;
    }),
    allLiveEdges: vi.fn(async () => edges),
  },
}));

const { suggestValues, invalidateSuggestCache } = await import('./suggest.js');
const { bumpWriteGeneration } = await import('../db/write-signal.js');

beforeEach(() => {
  invalidateSuggestCache();
  nodeReads = 0;
});

describe('suggestValues', () => {
  it('returns a field’s own previous values, most-used first', async () => {
    const values = await suggestValues({ type: 'organization', prop: 'industry' });
    expect(values).toEqual([
      { value: 'Leadership consulting', count: 2 },
      { value: 'Online education', count: 1 },
    ]);
  });

  it('scopes to the owning type, so unrelated records do not bleed in', async () => {
    // role.city and organization.hq_city are different fields; only the curated
    // `city` pool deliberately merges them.
    expect(await suggestValues({ type: 'role', prop: 'city' })).toEqual([
      { value: 'Kigali', count: 1 },
    ]);
    expect(await suggestValues({ type: 'organization', prop: 'city' })).toEqual([]);
  });

  it('serves edge props too', async () => {
    expect(await suggestValues({ type: 'KNOWS', prop: 'met_via' })).toEqual([
      { value: 'a conference', count: 2 },
    ]);
  });

  it('still serves the curated pools that cross types', async () => {
    const cities = await suggestValues({ kind: 'city' });
    expect(cities.map((v) => v.value)).toContain('Kigali');
    const skills = await suggestValues({ kind: 'skill' });
    expect(skills.map((v) => v.value)).toEqual(expect.arrayContaining(['Python', 'py']));
  });

  it('filters by the typed prefix', async () => {
    expect(await suggestValues({ type: 'organization', prop: 'industry', q: 'online' })).toEqual([
      { value: 'Online education', count: 1 },
    ]);
  });

  it('returns nothing for a field with no history, rather than failing', async () => {
    // The ordinary first case: the input must stay usable.
    expect(await suggestValues({ type: 'organization', prop: 'never_typed' })).toEqual([]);
    expect(await suggestValues({ kind: 'nonsense' })).toEqual([]);
  });
});

describe('read cost', () => {
  it('serves a burst of typing across many fields from one scan', async () => {
    for (const q of ['l', 'le', 'lea', 'lead']) {
      await suggestValues({ type: 'organization', prop: 'industry', q });
    }
    await suggestValues({ type: 'role', prop: 'team' });
    await suggestValues({ type: 'KNOWS', prop: 'met_via' });
    await suggestValues({ kind: 'city' });

    expect(nodeReads, 'a typing burst must not re-read the graph per keystroke').toBe(1);
  });

  it('rebuilds once the graph has actually changed', async () => {
    await suggestValues({ type: 'organization', prop: 'industry' });
    expect(nodeReads).toBe(1);

    bumpWriteGeneration();

    await suggestValues({ type: 'organization', prop: 'industry' });
    expect(nodeReads, 'a value written a moment ago has to become visible').toBe(2);
  });
});
