import { describe, expect, it } from 'vitest';
import { clusterHeading, type DupCluster } from './Duplicates.js';

function member(title: string, id = title) {
  return { id, type: 'person' as const, title, meta: '', rev: 1 };
}

function cluster(titles: string[]): Pick<DupCluster, 'members' | 'type'> {
  return { type: 'person', members: titles.map((title, i) => member(title, `m${i}`)) };
}

describe('clusterHeading', () => {
  it('joins two member titles for the common pair case', () => {
    expect(clusterHeading(cluster(['Sarah Chen', 'Sara Chen']))).toBe('Sarah Chen · Sara Chen');
  });

  it('keeps longer clusters scannable without listing every name', () => {
    expect(clusterHeading(cluster(['Ada', 'Ada Lovelace', 'A. Lovelace']))).toBe('Ada · Ada Lovelace +1');
  });

  it('falls back to the entity type when titles are empty', () => {
    expect(clusterHeading({ type: 'organization', members: [member('   ', 'x')] })).toBe('organization');
  });
});
