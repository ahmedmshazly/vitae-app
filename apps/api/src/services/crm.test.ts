import { describe, expect, it, vi } from 'vitest';

const now = '2026-07-28T20:00:00.000Z';
const nodes = [
  {
    id: 'imported-person',
    type: 'person',
    title: 'Imported Person',
    subtitle: null,
    props: { headline: 'Scraped profile' },
    source: 'import_aperture',
    created_at: now,
    updated_at: now,
    deleted_at: null,
    merged_into: null,
  },
  {
    id: 'self-person',
    type: 'person',
    title: 'Owner',
    subtitle: null,
    props: { is_self: true },
    source: 'manual',
    created_at: now,
    updated_at: now,
    deleted_at: null,
    merged_into: null,
  },
];

vi.mock('../db/repository.js', () => ({
  repository: {
    allLiveNodes: vi.fn(async () => nodes),
    allLiveEdges: vi.fn(async () => []),
  },
}));

// Reproduce a fresh/legacy production graph where getSelf cannot resolve an
// anchor. The directory must still show its ordinary person records.
vi.mock('./self.js', () => ({
  getSelf: vi.fn(async () => null),
}));

import { peopleList } from './crm.js';

describe('peopleList', () => {
  it('lists non-self people even when the graph has no resolvable self anchor', async () => {
    const people = await peopleList();

    expect(people.map((person) => person.id)).toEqual(['imported-person']);
    expect(people[0]).toMatchObject({
      title: 'Imported Person',
      source: 'import_aperture',
      closeness: null,
    });
  });
});
