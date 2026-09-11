import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectCompletions } from './analytics/index.js';
import { analyticsCasesSchema } from './fixture-schemas.js';
import { replayRevisions } from './replay.js';

function readCases() {
  const path = fileURLToPath(new URL('./__fixtures__/analytics-cases.json', import.meta.url));
  return analyticsCasesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

describe('projectCompletions fixtures', () => {
  it('executes every analytics-cases.json row', () => {
    for (const row of readCases()) {
      const figure = projectCompletions(row);
      expect({
        id: row.id,
        completions: figure.completions,
        history_completeness: figure.history_completeness,
      }).toEqual({
        id: row.id,
        completions: row.expected.completions,
        history_completeness: row.expected.history_completeness,
      });
    }
  });
});

describe('replay + analytics reconstruction', () => {
  it('replaying the same revisions twice yields identical DTOs', () => {
    const row = readCases().find((entry) => entry.id === 'one-completion-complete-history');
    if (!row) throw new Error('missing complete-history fixture');
    const first = projectCompletions(row);
    const second = projectCompletions(row);
    expect(second).toEqual(first);

    const snap = { id: row.item.id, status: row.item.status, completed_at: row.item.completed_at ?? null };
    expect(replayRevisions(snap, row.revisions)).toEqual(replayRevisions(snap, row.revisions));
  });
});
