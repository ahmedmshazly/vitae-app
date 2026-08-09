import { describe, expect, it } from 'vitest';
import { spreadCollidingPins } from './geo.js';

describe('spreadCollidingPins', () => {
  it('leaves isolated pins unmoved', () => {
    const pins = [
      { id: 'a', lat: 30, lng: 31 },
      { id: 'b', lat: 51, lng: 0 },
    ];
    const out = spreadCollidingPins(pins, 2);
    expect(out).toHaveLength(2);
    expect(out.every((p) => !p.spread)).toBe(true);
    expect(out.find((p) => p.pin.id === 'a')?.lat).toBe(30);
  });

  it('offsets near-coincident pins onto a ring', () => {
    const pins = [
      { id: 'cairo', lat: 30.04, lng: 31.24 },
      { id: 'giza', lat: 29.99, lng: 31.13 },
    ];
    const out = spreadCollidingPins(pins, 2, 0.2);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.spread)).toBe(true);
    const a = out.find((p) => p.pin.id === 'cairo')!;
    const b = out.find((p) => p.pin.id === 'giza')!;
    expect(a.lat !== b.lat || a.lng !== b.lng).toBe(true);
    const dist = Math.hypot(a.lat - b.lat, a.lng - b.lng);
    expect(dist).toBeGreaterThan(0.05);
    // Both share the same center
    expect(a.centerLat).toBeCloseTo(b.centerLat, 5);
  });
});
