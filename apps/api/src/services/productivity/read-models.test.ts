import { describe, expect, it } from 'vitest';
import type { NodeRecord } from '@vitae/core';
import { compareTasks, placeTask, toTaskReadModel } from './read-models.js';

function task(partial: Partial<NodeRecord> & Pick<NodeRecord, 'id' | 'title'>): NodeRecord {
  const { props: extraProps, ...rest } = partial;
  return {
    type: 'task',
    subtitle: undefined,
    identity_keys: [],
    notes_md: '',
    date_precision: 'day',
    pinned: false,
    sensitivity: 'normal',
    source: 'manual',
    confidence: 1,
    captured_at: '2026-09-11T00:00:00.000Z',
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    archived_at: null,
    deleted_at: null,
    merged_into: null,
    rev: 1,
    ...rest,
    props: { status: 'inbox', ...(extraProps ?? {}) },
  };
}

describe('productivity read models', () => {
  it('always attaches a placement reason', () => {
    const node = task({ id: 't1', title: 'No dates' });
    const placement = placeTask(node, [], new Map([[node.id, node]]), '2026-09-11', 'UTC');
    const model = toTaskReadModel(node, placement);
    expect(model.placement?.reason).toBe('no_signal');
    expect(model.open).toBe(true);
    expect(model.quadrant).toBe('eliminate');
  });

  it('sorts keyed tasks ahead of legacy tasks that have no sort_key', () => {
    const keyed = task({ id: 'a', title: 'Keyed', props: { status: 'next', sort_key: 0 }, updated_at: '2026-09-01T00:00:00.000Z' });
    const legacy = task({ id: 'b', title: 'Legacy', updated_at: '2026-09-10T00:00:00.000Z' });
    expect([legacy, keyed].sort(compareTasks).map((n) => n.id)).toEqual(['a', 'b']);
  });
});
