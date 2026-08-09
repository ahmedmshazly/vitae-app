import { describe, expect, it } from 'vitest';
import { sourceStatus, type Batch } from './ImportHub.js';

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
