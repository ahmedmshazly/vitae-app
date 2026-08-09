import { describe, expect, it } from 'vitest';
import { parseCapture, parseDateToken } from './capture-grammar.js';

const NOW = new Date('2026-07-11T12:00:00Z'); // a Saturday

describe('parseCapture (SRS §5.1)', () => {
  it('parses the canonical J1 example', () => {
    const plan = parseCapture('p Lina Farouk @@DevFest Cairo #ml > met at speaker dinner', NOW);
    expect(plan.primaryType).toBe('person');
    expect(plan.title).toBe('Lina Farouk');
    expect(plan.orgs).toEqual(['DevFest Cairo']);
    expect(plan.tags).toEqual(['ml']);
    expect(plan.notes).toBe('met at speaker dinner');
  });

  it('captures @people, priority, and dates', () => {
    const plan = parseCapture('t send deck @Sarah Chen !p1 ^fri', NOW);
    expect(plan.primaryType).toBe('task');
    expect(plan.title).toBe('send deck');
    expect(plan.people).toEqual(['Sarah Chen']);
    expect(plan.priority).toBe('p1');
    expect(plan.date?.iso).toBe('2026-07-17'); // next Friday
  });

  it('recognizes the multi-char "int" leading key', () => {
    const plan = parseCapture('int coffee @Sarah', NOW);
    expect(plan.primaryType).toBe('interaction');
  });

  it('treats a bare URL as a link node', () => {
    const plan = parseCapture('https://example.com/article', NOW);
    expect(plan.primaryType).toBe('link');
    expect(plan.url).toBe('https://example.com/article');
  });

  it('supports note-append mode', () => {
    const plan = parseCapture('n promised to send the RL paper', NOW);
    expect(plan.primaryType).toBe('note_append');
    expect(plan.title).toBe('promised to send the RL paper');
  });

  it('parses goal and habit leading keys', () => {
    expect(parseCapture('g Publish at a top venue ^2026-12-31', NOW).primaryType).toBe('goal');
    expect(parseCapture('h Morning run', NOW).primaryType).toBe('habit');
  });

  it('builds preview chips for every parsed element', () => {
    const plan = parseCapture('p Ada @@Acme #ai ^today', NOW);
    const kinds = plan.chips.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['type', 'title', 'org', 'tag', 'date']));
  });

  it('does not treat prototype property names as leading type keys', () => {
    const plan = parseCapture('__proto__ anything', NOW);
    expect(plan.primaryType).toBe('unknown');
    expect(plan.title).toContain('__proto__');
    expect(() => parseCapture('constructor foo', NOW)).not.toThrow();
  });
});

describe('parseDateToken', () => {
  it('resolves relative dates', () => {
    expect(parseDateToken('today', NOW)!.iso).toBe('2026-07-11');
    expect(parseDateToken('tomorrow', NOW)!.iso).toBe('2026-07-12');
  });
  it('resolves weekdays to the next occurrence', () => {
    // NOW is Saturday; "^sat" should be next Saturday, not today.
    expect(parseDateToken('sat', NOW)!.iso).toBe('2026-07-18');
  });
  it('accepts ISO dates', () => {
    expect(parseDateToken('2026-12-25', NOW)!.iso).toBe('2026-12-25');
  });
  it('returns null for garbage', () => {
    expect(parseDateToken('someday', NOW)).toBeNull();
  });
});
