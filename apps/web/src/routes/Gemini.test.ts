import { describe, expect, it } from 'vitest';
import { geminiConnectionState } from './Gemini.js';

describe('geminiConnectionState', () => {
  it('does not claim a missing key while Settings is still loading', () => {
    expect(geminiConnectionState('loading', undefined)).toEqual({
      label: 'checking',
      tone: 'muted',
      connected: false,
    });
  });

  it('names a Settings failure instead of inventing a missing key', () => {
    expect(geminiConnectionState('error', undefined)).toEqual({
      label: 'unavailable',
      tone: 'danger',
      connected: false,
    });
  });

  it('reports not connected only after Settings is ready', () => {
    expect(
      geminiConnectionState('ready', { configured: false, project: null, source: 'none' }),
    ).toEqual({
      label: 'not connected',
      tone: 'warning',
      connected: false,
    });
  });

  it('reports connected once a key is configured', () => {
    expect(
      geminiConnectionState('ready', {
        configured: true,
        project: 'gen-lang-client-test',
        source: 'env',
      }),
    ).toEqual({
      label: 'connected',
      tone: 'success',
      connected: true,
    });
  });
});
