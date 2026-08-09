import { lookupCity, project, type CityCoord } from '../../lib/cities.js';
import type { MapCity, MapTrip, MapTripStop } from './types.js';

export function resolveCoord(city: string, lat?: number, lng?: number): CityCoord | null {
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return lookupCity(city);
}

export function cityCoord(city: MapCity): CityCoord | null {
  return resolveCoord(city.city, city.lat, city.lng);
}

export function cityScreenPos(
  city: MapCity,
): { x: number; y: number; mapped: boolean } {
  const coord = cityCoord(city);
  if (!coord) return { x: 0, y: 0, mapped: false };
  const { x, y } = project(coord);
  return { x, y, mapped: true };
}

export function stopScreenPos(stop: MapTripStop): { x: number; y: number } | null {
  const coord = resolveCoord(stop.city, stop.lat, stop.lng);
  if (!coord) return null;
  return project(coord);
}

/** Great-circle polyline as [lng, lat] pairs for MapLibre GeoJSON. */
export function greatCircleLngLat(
  a: CityCoord,
  b: CityCoord,
  steps = 32,
): Array<[number, number]> {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lng);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lng);
  const Δ = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
    ),
  );
  if (!Number.isFinite(Δ) || Δ < 1e-6) {
    return [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ];
  }
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * Δ) / Math.sin(Δ);
    const B = Math.sin(f * Δ) / Math.sin(Δ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    pts.push([toDeg(λ), toDeg(φ)]);
  }
  return pts;
}

/** Approximate great-circle polyline in percent coords (equirectangular). */
export function greatCirclePath(
  a: CityCoord,
  b: CityCoord,
  steps = 24,
): Array<{ x: number; y: number }> {
  return greatCircleLngLat(a, b, steps).map(([lng, lat]) => project({ lat, lng }));
}

export function tripArcPaths(trip: MapTrip): string[] {
  const coords: CityCoord[] = [];
  for (const stop of trip.stops) {
    const c = resolveCoord(stop.city, stop.lat, stop.lng);
    if (c) coords.push(c);
  }
  const paths: string[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const pts = greatCirclePath(coords[i]!, coords[i + 1]!);
    paths.push(pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '));
  }
  return paths;
}

/** GeoJSON MultiLineString coordinates for a trip route. */
export function tripArcLngLats(trip: MapTrip): Array<Array<[number, number]>> {
  const coords: CityCoord[] = [];
  for (const stop of trip.stops) {
    const c = resolveCoord(stop.city, stop.lat, stop.lng);
    if (c) coords.push(c);
  }
  const lines: Array<Array<[number, number]>> = [];
  for (let i = 0; i < coords.length - 1; i++) {
    lines.push(greatCircleLngLat(coords[i]!, coords[i + 1]!));
  }
  return lines;
}

/** Grid-bucket cluster at low zoom (percent-space). */
export function clusterPins<T extends { x: number; y: number; count: number }>(
  pins: T[],
  cell = 4,
): Array<T & { members: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const p of pins) {
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(p);
  }
  const out: Array<T & { members: T[] }> = [];
  for (const members of buckets.values()) {
    if (members.length === 1) {
      out.push({ ...members[0]!, members });
      continue;
    }
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const m of members) {
      sx += m.x;
      sy += m.y;
      count += m.count;
    }
    const n = members.length;
    out.push({
      ...members[0]!,
      x: sx / n,
      y: sy / n,
      count,
      members,
    });
  }
  return out;
}

export interface SpreadPin<T> {
  pin: T;
  lat: number;
  lng: number;
  /** True when this pin was offset from a shared center. */
  spread: boolean;
  centerLat: number;
  centerLng: number;
}

/**
 * Spiral-offset pins that share nearly the same lat/lng so they remain clickable.
 * `mapZoom` is MapLibre zoom; larger zoom → smaller geographic radius.
 */
export function spreadCollidingPins<T extends { lat: number; lng: number }>(
  pins: T[],
  mapZoom = 2,
  thresholdDeg = 0.15,
): Array<SpreadPin<T>> {
  if (pins.length === 0) return [];

  const used = new Set<number>();
  const out: Array<SpreadPin<T>> = [];
  // Shrink threshold slightly as we zoom in so nearby cities (Cairo/Giza) separate sooner.
  const thr = thresholdDeg / Math.max(1, mapZoom / 2);

  for (let i = 0; i < pins.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    used.add(i);
    const a = pins[i]!;
    for (let j = i + 1; j < pins.length; j++) {
      if (used.has(j)) continue;
      const b = pins[j]!;
      const dLat = a.lat - b.lat;
      const dLng = a.lng - b.lng;
      if (dLat * dLat + dLng * dLng <= thr * thr) {
        group.push(j);
        used.add(j);
      }
    }

    if (group.length === 1) {
      const p = pins[group[0]!]!;
      out.push({
        pin: p,
        lat: p.lat,
        lng: p.lng,
        spread: false,
        centerLat: p.lat,
        centerLng: p.lng,
      });
      continue;
    }

    let cLat = 0;
    let cLng = 0;
    for (const idx of group) {
      cLat += pins[idx]!.lat;
      cLng += pins[idx]!.lng;
    }
    cLat /= group.length;
    cLng /= group.length;

    // Geographic radius ~ a few km at z=2; shrinks with zoom.
    const baseRadius = 0.08 / Math.max(0.8, mapZoom / 2.5);
    const n = group.length;
    group.forEach((idx, k) => {
      const p = pins[idx]!;
      // Start at east so pairs separate in lng, not only lat.
      const angle = (2 * Math.PI * k) / n;
      const ring = 1 + Math.floor(k / Math.max(6, n));
      const r = baseRadius * ring * (0.7 + 0.15 * Math.min(n, 8));
      // Cosine scale so lng offset stays reasonable near poles.
      const cosLat = Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
      out.push({
        pin: p,
        lat: cLat + r * Math.sin(angle),
        lng: cLng + (r * Math.cos(angle)) / cosLat,
        spread: true,
        centerLat: cLat,
        centerLng: cLng,
      });
    });
  }

  return out;
}
