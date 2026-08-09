/**
 * The interaction log's two pure pieces: turning neighbour nodes into a
 * chronological log, and turning that log into register-rule ticks.
 */
import { describe, expect, it } from 'vitest';
import { interactionTicks, toInteractionLog, type InteractionNode } from './Person.js';

const node = (id: string, over: Partial<InteractionNode> = {}): InteractionNode => ({
  id,
  type: 'interaction',
  title: `interaction ${id}`,
  ...over,
});

describe('toInteractionLog', () => {
  it('orders by when it happened, not by edge insertion order', () => {
    const log = toInteractionLog([
      node('a', { props: { occurred_at: '2026-01-01T00:00:00Z' } }),
      node('b', { props: { occurred_at: '2026-06-01T00:00:00Z' } }),
      node('c', { props: { occurred_at: '2026-03-01T00:00:00Z' } }),
    ]);
    expect(log.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('surfaces the kind and the date, both of which the page never read', () => {
    const [entry] = toInteractionLog([
      node('a', { props: { kind: 'coffee', occurred_at: '2026-05-04T09:00:00Z' } }),
    ]);
    expect(entry).toMatchObject({ kind: 'coffee', at: '2026-05-04T09:00:00Z' });
  });

  it('falls back to when it was recorded if it never said when it happened', () => {
    const [entry] = toInteractionLog([node('a', { created_at: '2026-02-02T00:00:00Z' })]);
    expect(entry.at).toBe('2026-02-02T00:00:00Z');
  });

  it('renders one row per interaction even if two edges reach it', () => {
    const shared = node('a', { props: { occurred_at: '2026-01-01T00:00:00Z' } });
    expect(toInteractionLog([shared, shared])).toHaveLength(1);
  });
});

describe('interactionTicks', () => {
  const at = (iso: string, kind = 'coffee') => ({ id: iso, title: 't', kind, at: iso });

  it('places ticks by date, so clustering is visible rather than averaged away', () => {
    // Three in one week, then a long silence, then one today.
    const { ticks, index } = interactionTicks([
      at('2026-08-01T00:00:00Z'),
      at('2026-01-03T00:00:00Z'),
      at('2026-01-02T00:00:00Z'),
      at('2026-01-01T00:00:00Z'),
    ]);
    expect(ticks).toHaveLength(4);
    // Oldest first; the early cluster sits near the left, the recent one far right.
    expect(ticks[0].at).toBeLessThan(0.05);
    expect(ticks[1].at).toBeLessThan(0.05);
    expect(ticks[3].at).toBeGreaterThan(0.9);
    // Active is the most recent.
    expect(index).toBe(3);
  });

  it('keeps every tick inside the rule', () => {
    for (const t of interactionTicks([at('2026-01-01T00:00:00Z'), at('2026-12-31T00:00:00Z')]).ticks) {
      expect(t.at).toBeGreaterThan(0);
      expect(t.at).toBeLessThan(1);
    }
  });

  it('centres a single interaction rather than dividing by a zero span', () => {
    const { ticks } = interactionTicks([at('2026-01-01T00:00:00Z')]);
    expect(ticks).toHaveLength(1);
    expect(Number.isFinite(ticks[0].at)).toBe(true);
    expect(ticks[0].at).toBeGreaterThan(0);
    expect(ticks[0].at).toBeLessThan(1);
  });

  it('reports no ticks rather than faking a scale when nothing is dated', () => {
    expect(interactionTicks([{ id: 'a', title: 't', at: '' }])).toEqual({ ticks: [], index: -1 });
    expect(interactionTicks([])).toEqual({ ticks: [], index: -1 });
  });

  it('caps a long history so the rule stays a scale', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      at(`2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
    );
    expect(interactionTicks(many).ticks.length).toBeLessThanOrEqual(40);
  });
});
