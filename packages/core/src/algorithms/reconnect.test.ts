import { describe, expect, it } from 'vitest';
import { rankReconnect, reconnectPriority } from './reconnect.js';

describe('reconnect (spaced-repetition, SRS §10.7.2)', () => {
  it('prioritizes valuable AND decayed ties', () => {
    const closeDecayed = reconnectPriority({ id: 'a', closeness: 5, intensity: 0.1 });
    const closeFresh = reconnectPriority({ id: 'b', closeness: 5, intensity: 3 });
    const distantDecayed = reconnectPriority({ id: 'c', closeness: 1, intensity: 0.1 });
    expect(closeDecayed.priority).toBeGreaterThan(closeFresh.priority);
    expect(closeDecayed.priority).toBeGreaterThan(distantDecayed.priority);
  });

  it('drops a freshly-contacted close friend to near zero', () => {
    expect(reconnectPriority({ id: 'x', closeness: 5, intensity: 5 }).priority).toBe(0);
  });

  it('ranks highest-priority first, deterministically', () => {
    const ranked = rankReconnect([
      { id: 'fresh', closeness: 5, intensity: 3 },
      { id: 'lapsed', closeness: 4, intensity: 0.2 },
    ]);
    expect(ranked[0]!.id).toBe('lapsed');
  });
});
