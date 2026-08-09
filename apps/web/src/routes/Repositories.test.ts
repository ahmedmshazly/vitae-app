import { describe, expect, it } from 'vitest';
import { formatLastSync, githubConnectionState } from './Repositories.js';

describe('githubConnectionState', () => {
  it('does not claim a missing token while Settings is still loading', () => {
    expect(githubConnectionState('loading', undefined)).toEqual({
      label: 'checking',
      tone: 'muted',
      connected: false,
      canSync: false,
    });
  });

  it('names a Settings failure instead of inventing a missing token', () => {
    expect(githubConnectionState('error', undefined)).toEqual({
      label: 'unavailable',
      tone: 'danger',
      connected: false,
      canSync: false,
    });
  });

  it('reports not connected only after Settings is ready', () => {
    expect(githubConnectionState('ready', { configured: false, lastSyncAt: null })).toEqual({
      label: 'not connected',
      tone: 'warning',
      connected: false,
      canSync: false,
    });
  });

  it('allows sync only when a token is configured', () => {
    expect(
      githubConnectionState('ready', { configured: true, lastSyncAt: '2026-08-01T10:00:00.000Z' }),
    ).toEqual({
      label: 'connected',
      tone: 'success',
      connected: true,
      canSync: true,
    });
  });
});

describe('formatLastSync', () => {
  it('formats an ISO timestamp without inventing a sync', () => {
    expect(formatLastSync(null)).toBe('never');
    expect(formatLastSync('2026-08-01T10:15:00.000Z')).toBe('2026-08-01 10:15');
  });
});
