import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rulesCasesSchema } from './fixture-schemas.js';
import { evaluateCondition, evaluateRule } from './rules.js';

function readCases() {
  const path = fileURLToPath(new URL('./__fixtures__/rules-cases.json', import.meta.url));
  return rulesCasesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

describe('evaluateRule fixtures', () => {
  it('executes every rules-cases.json row', () => {
    for (const row of readCases()) {
      const result = evaluateRule(row.input.rule, row.input.item, { now: '2026-09-04' });
      expect({ id: row.id, matches: result.matches, patch: result.patch }).toEqual({
        id: row.id,
        matches: row.expected.matches,
        patch: row.expected.patch,
      });
    }
  });
});

describe('evaluateCondition', () => {
  const now = { now: '2026-09-04' as const };

  it('treats an unauthored {} as matching nothing', () => {
    expect(evaluateCondition({}, { status: 'inbox' }, { ...now, urgencyWindowDays: 7, waitingPatienceDays: 7, project: null, goal: null, waitingOn: null, stage: null })).toBe(
      false,
    );
  });

  it('composes all / any / not', () => {
    const inbox = {
      kind: 'predicate' as const,
      field: 'status' as const,
      operator: 'eq' as const,
      value: 'inbox',
    };
    const item = { status: 'inbox' };
    const ctx = {
      now: '2026-09-04',
      urgencyWindowDays: 7,
      waitingPatienceDays: 7,
      project: null,
      goal: null,
      waitingOn: null,
      stage: null,
    };
    expect(evaluateCondition({ kind: 'all', conditions: [inbox] }, item, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'any', conditions: [inbox] }, item, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'not', condition: inbox }, item, ctx)).toBe(false);
  });
});
