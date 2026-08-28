import { describe, expect, it } from 'vitest';
import { commitAction, sourceStatus, type Batch } from './ImportHub.js';

function batch(over: Partial<Batch> & Pick<Batch, 'kind' | 'status'>): Batch {
  return {
    id: over.id ?? 'b1',
    kind: over.kind,
    detail: over.detail ?? null,
    filename: over.filename ?? null,
    status: over.status,
    created_at: over.created_at ?? '2026-08-01T10:00:00.000Z',
    stats: over.stats ?? { rows: 3, accepted: 3, dupCandidates: 0 },
  };
}

describe('sourceStatus', () => {
  it('does not claim GitHub needs a token while Settings is still loading', () => {
    expect(sourceStatus('github', new Map(), undefined, 'loading')).toEqual({
      label: 'checking',
      tone: 'muted',
    });
  });

  it('names a Settings failure instead of inventing a missing token', () => {
    expect(sourceStatus('github', new Map(), undefined, 'error')).toEqual({
      label: 'settings unavailable',
      tone: 'danger',
    });
  });

  it('reports a missing GitHub token only after Settings is ready', () => {
    expect(
      sourceStatus('github', new Map(), { configured: false, lastSyncAt: null }, 'ready'),
    ).toEqual({ label: 'needs token', tone: 'warning' });
  });

  it('shows the newest batch status for a file importer', () => {
    const last = new Map<string, Batch>([
      ['contacts', batch({ kind: 'contacts', status: 'staged' })],
      ['calendar', batch({ kind: 'calendar', status: 'committed', created_at: '2026-07-04T00:00:00.000Z' })],
    ]);
    expect(sourceStatus('contacts', last, undefined, 'ready')).toEqual({
      label: 'staged',
      tone: 'warning',
    });
    expect(sourceStatus('calendar', last, undefined, 'ready')).toEqual({
      label: 'committed 2026-07-04',
      tone: 'muted',
    });
    expect(sourceStatus('bookmarks', last, undefined, 'ready')).toEqual({
      label: 'ready',
      tone: 'muted',
    });
  });
});

describe('commitAction', () => {
  it('counts the rows the reviewer accepted', () => {
    expect(commitAction(1, 0, false)).toEqual({ label: 'Commit 1 row', disabled: false });
    expect(commitAction(4, 0, false)).toEqual({ label: 'Commit 4 rows', disabled: false });
  });

  it('lets a re-import that found nothing to change still be recorded', () => {
    // Otherwise the button waits for an acceptance nobody can give, and the
    // batch never gets to report that every row already matched.
    expect(commitAction(0, 3, false)).toEqual({
      label: 'Record 3 already matched',
      disabled: false,
    });
  });

  it('has nothing to do when every row is skipped', () => {
    expect(commitAction(0, 0, false)).toEqual({ label: 'Commit 0 rows', disabled: true });
  });

  it('locks while the commit is in flight', () => {
    expect(commitAction(2, 0, true)).toEqual({ label: 'Committing...', disabled: true });
  });
});
