/**
 * Derive undirected city↔city corridors from trip stop sequences.
 */
import { resolveCoord } from './geo.js';
import type { MapCity, MapTrip } from './types.js';

export interface Corridor {
  /** Canonical display label for endpoint A (lexicographically first key). */
  a: string;
  /** Canonical display label for endpoint B. */
  b: string;
  /** Normalized pair key `low|high`. */
  key: string;
  count: number;
  tripIds: string[];
  companionIds: string[];
}

export function cityKey(name: string): string {
  return name.trim().toLowerCase();
}

export function corridorKey(a: string, b: string): string {
  const ka = cityKey(a);
  const kb = cityKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function sortStops(trip: MapTrip): MapTrip['stops'] {
  return [...trip.stops].sort((x, y) => {
    const dx = x.date ?? '';
    const dy = y.date ?? '';
    if (dx !== dy) return dx.localeCompare(dy);
    return x.city.localeCompare(y.city);
  });
}

/** Build corridors from consecutive mapped stops on each trip. */
export function buildCorridors(trips: MapTrip[]): Corridor[] {
  const byKey = new Map<
    string,
    { a: string; b: string; tripIds: Set<string>; companionIds: Set<string> }
  >();

  for (const trip of trips) {
    const stops = sortStops(trip);
    const mapped: Array<{ city: string; lat: number; lng: number }> = [];
    for (const s of stops) {
      const c = resolveCoord(s.city, s.lat, s.lng);
      if (!c) continue;
      mapped.push({ city: s.city, lat: c.lat, lng: c.lng });
    }
    for (let i = 0; i < mapped.length - 1; i++) {
      const from = mapped[i]!;
      const to = mapped[i + 1]!;
      if (cityKey(from.city) === cityKey(to.city)) continue;
      const key = corridorKey(from.city, to.city);
      let entry = byKey.get(key);
      if (!entry) {
        const [aLabel, bLabel] =
          cityKey(from.city) < cityKey(to.city) ? [from.city, to.city] : [to.city, from.city];
        entry = { a: aLabel, b: bLabel, tripIds: new Set(), companionIds: new Set() };
        byKey.set(key, entry);
      }
      entry.tripIds.add(trip.id);
      for (const id of trip.companionIds) entry.companionIds.add(id);
    }
  }

  const all: Corridor[] = [...byKey.entries()].map(([key, e]) => ({
    key,
    a: e.a,
    b: e.b,
    count: e.tripIds.size,
    tripIds: [...e.tripIds],
    companionIds: [...e.companionIds].sort(),
  }));
  all.sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
  return all;
}

/** Cap drawn corridors; always include selected. */
export function capCorridors(all: Corridor[], limit = 80, selectedKey: string | null = null): Corridor[] {
  if (all.length <= limit) return all;
  const capped = all.slice(0, limit);
  return corridorsForDraw(all, capped, selectedKey);
}

export function findCorridor(corridors: Corridor[], a: string, b: string): Corridor | null {
  const key = corridorKey(a, b);
  return corridors.find((c) => c.key === key) ?? null;
}

export function tripsForCorridor(trips: MapTrip[], corridor: Corridor): MapTrip[] {
  const ids = new Set(corridor.tripIds);
  return trips.filter((t) => ids.has(t.id));
}

export function tripsLinkingCities(trips: MapTrip[], a: string, b: string): MapTrip[] {
  const ka = cityKey(a);
  const kb = cityKey(b);
  return trips.filter((t) => {
    const keys = new Set(t.stops.map((s) => cityKey(s.city)));
    return keys.has(ka) && keys.has(kb);
  });
}

export interface SharedPerson {
  id: string;
  title: string;
}

/** Person records present in both city buckets. */
export function sharedPeople(cities: MapCity[], a: string, b: string): SharedPerson[] {
  const ka = cityKey(a);
  const kb = cityKey(b);
  const cityA = cities.find((c) => cityKey(c.city) === ka);
  const cityB = cities.find((c) => cityKey(c.city) === kb);
  if (!cityA || !cityB) return [];
  const inB = new Map(
    cityB.records.filter((r) => r.type === 'person').map((r) => [r.id, r.title] as const),
  );
  const out: SharedPerson[] = [];
  for (const r of cityA.records) {
    if (r.type !== 'person') continue;
    if (!inB.has(r.id)) continue;
    out.push({ id: r.id, title: r.title });
  }
  out.sort((x, y) => x.title.localeCompare(y.title));
  return out;
}

export function corridorPeople(
  corridor: Corridor,
  cities: MapCity[],
  companionTitles: Map<string, string>,
): SharedPerson[] {
  const shared = sharedPeople(cities, corridor.a, corridor.b);
  const seen = new Set(shared.map((p) => p.id));
  const out = [...shared];
  for (const id of corridor.companionIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: companionTitles.get(id) ?? id.slice(0, 8) });
  }
  out.sort((x, y) => x.title.localeCompare(y.title));
  return out;
}

/** Ensure selected corridor is in the draw list even if capped out. */
export function corridorsForDraw(
  all: Corridor[],
  capped: Corridor[],
  selectedKey: string | null,
): Corridor[] {
  if (!selectedKey) return capped;
  if (capped.some((c) => c.key === selectedKey)) return capped;
  const hit = all.find((c) => c.key === selectedKey);
  return hit ? [...capped, hit] : capped;
}
