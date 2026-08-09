import { describe, expect, it } from 'vitest';
import { formatGithubSync, statusCheckDetail } from './Settings.js';

describe('statusCheckDetail', () => {
  it('prefers the server detail when present', () => {
    expect(statusCheckDetail({ ok: true, detail: '12ms' })).toBe('12ms');
    expect(statusCheckDetail({ ok: false, detail: 'connection refused' })).toBe('connection refused');
  });

  it('falls back to ok/down so colour is never the only signal', () => {
    expect(statusCheckDetail({ ok: true })).toBe('ok');
    expect(statusCheckDetail({ ok: false })).toBe('down');
  });
});

describe('formatGithubSync', () => {
  it('formats an ISO timestamp without inventing a sync', () => {
    expect(formatGithubSync(null)).toBe('never');
    expect(formatGithubSync('2026-08-01T10:15:00.000Z')).toBe('2026-08-01 10:15');
  });
});
