import { createHash } from 'node:crypto';
import {
  BUILTIN_CITIES,
  STATIC_PLACE_ALIASES,
  fuzzyPlaceMatches,
  lookupBuiltinCity,
  normalizePlaceKey,
  type CityCoord,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { nowIso } from '../db/util.js';

export interface PlaceRecord {
  label: string;
  lat: number;
  lng: number;
  osmId?: string;
  countryCode?: string;
}

export interface PlaceRegistry {
  places: Record<string, PlaceRecord>;
  /** normalized alias → placeId */
  aliases: Record<string, string>;
  updated_at?: string;
}

export interface ResolvedPlace {
  placeId?: string;
  label: string;
  lat?: number;
  lng?: number;
  mapped: boolean;
}

const DOC_ID = 'place_registry';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = 'VitaeAtlas/1.0 (private life OS; contact: local-dev)';

const searchCache = new Map<string, { at: number; results: NominatimHit[] }>();
const CACHE_MS = 60_000;

export interface NominatimHit {
  displayName: string;
  lat: number;
  lng: number;
  osmId?: string;
  countryCode?: string;
  type?: string;
}

function emptyRegistry(): PlaceRegistry {
  return { places: {}, aliases: {} };
}

export async function getPlaceRegistry(): Promise<PlaceRegistry> {
  const data = await repository.docGet<Partial<PlaceRegistry>>('meta', DOC_ID);
  if (!data) return emptyRegistry();
  return {
    places: data.places ?? {},
    aliases: data.aliases ?? {},
    updated_at: data.updated_at,
  };
}

function placeIdFromOsm(osmId: string | undefined, lat: number, lng: number): string {
  if (osmId) return `osm:${osmId}`;
  const h = createHash('sha1').update(`${lat.toFixed(5)},${lng.toFixed(5)}`).digest('hex').slice(0, 12);
  return `geo:${h}`;
}

/** Merged alias map: static seed under user overrides. */
export function mergedAliases(registry: PlaceRegistry): Record<string, string> {
  const out: Record<string, string> = {};
  // Static: alias key → canonical key; materialize as synthetic place ids later.
  for (const [alias, canonical] of Object.entries(STATIC_PLACE_ALIASES)) {
    out[alias] = `builtin:${canonical}`;
  }
  for (const [alias, placeId] of Object.entries(registry.aliases)) {
    out[normalizePlaceKey(alias)] = placeId;
  }
  return out;
}

function builtinPlace(canonicalKey: string): PlaceRecord | null {
  const coord = BUILTIN_CITIES[canonicalKey];
  if (!coord) return null;
  const label = canonicalKey.replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, lat: coord.lat, lng: coord.lng };
}

export function resolvePlaceLabel(raw: string, registry: PlaceRegistry): ResolvedPlace {
  const key = normalizePlaceKey(raw);
  if (!key) return { label: raw, mapped: false };

  const aliases = mergedAliases(registry);
  const placeId = aliases[key];

  if (placeId?.startsWith('builtin:')) {
    const canon = placeId.slice('builtin:'.length);
    const place = builtinPlace(canon);
    if (place) {
      return { placeId, label: place.label, lat: place.lat, lng: place.lng, mapped: true };
    }
  }

  if (placeId && registry.places[placeId]) {
    const p = registry.places[placeId]!;
    return { placeId, label: p.label, lat: p.lat, lng: p.lng, mapped: true };
  }

  // Direct builtin / static canonical
  const viaStatic = STATIC_PLACE_ALIASES[key] ?? key;
  const builtin = lookupBuiltinCity(viaStatic) ?? lookupBuiltinCity(key);
  if (builtin) {
    const place = builtinPlace(viaStatic) ?? builtinPlace(key);
    return {
      placeId: `builtin:${viaStatic}`,
      label: place?.label ?? raw,
      lat: builtin.lat,
      lng: builtin.lng,
      mapped: true,
    };
  }

  return { label: raw, mapped: false };
}

export async function resolvePlace(raw: string): Promise<ResolvedPlace> {
  return resolvePlaceLabel(raw, await getPlaceRegistry());
}

export interface ResolvePlaceInput {
  /** Original unmapped label(s) to alias onto this place. */
  aliases: string[];
  label: string;
  lat: number;
  lng: number;
  osmId?: string;
  countryCode?: string;
  /** Merge into an existing place id when set. */
  placeId?: string;
}

export async function upsertPlaceResolve(input: ResolvePlaceInput): Promise<PlaceRegistry> {
  const registry = await getPlaceRegistry();
  const placeId =
    input.placeId && (registry.places[input.placeId] || input.placeId.startsWith('builtin:'))
      ? input.placeId
      : placeIdFromOsm(input.osmId, input.lat, input.lng);

  const existing = registry.places[placeId];
  registry.places[placeId] = {
    label: input.label.trim() || existing?.label || input.aliases[0] || 'Place',
    lat: input.lat,
    lng: input.lng,
    ...(input.osmId || existing?.osmId ? { osmId: input.osmId ?? existing?.osmId } : {}),
    ...(input.countryCode || existing?.countryCode
      ? { countryCode: input.countryCode ?? existing?.countryCode }
      : {}),
  };

  for (const a of input.aliases) {
    const k = normalizePlaceKey(a);
    if (k) registry.aliases[k] = placeId;
  }
  // Also alias the canonical label.
  const labelKey = normalizePlaceKey(registry.places[placeId]!.label);
  if (labelKey) registry.aliases[labelKey] = placeId;

  registry.updated_at = nowIso();
  await repository.docPut('meta', DOC_ID, registry as unknown as Record<string, unknown>);
  return registry;
}

export async function nominatimSearch(q: string): Promise<NominatimHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const cacheKey = normalizePlaceKey(query);
  const hit = searchCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '8');

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim search failed (${res.status})`);
  const rows = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    osm_type?: string;
    osm_id?: number;
    type?: string;
    address?: { country_code?: string };
  }>;

  const results: NominatimHit[] = rows.map((r) => ({
    displayName: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    osmId: r.osm_type && r.osm_id != null ? `${r.osm_type[0]!.toUpperCase()}${r.osm_id}` : undefined,
    countryCode: r.address?.country_code?.toUpperCase(),
    type: r.type,
  }));
  searchCache.set(cacheKey, { at: Date.now(), results });
  return results;
}

export async function nominatimReverse(lat: number, lng: number): Promise<NominatimHit | null> {
  const url = new URL(`${NOMINATIM}/reverse`);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim reverse failed (${res.status})`);
  const r = (await res.json()) as {
    display_name?: string;
    lat?: string;
    lon?: string;
    osm_type?: string;
    osm_id?: number;
    type?: string;
    address?: { country_code?: string; city?: string; town?: string; village?: string };
    error?: string;
  };
  if (r.error || !r.lat || !r.lon) return null;
  return {
    displayName: r.display_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    lat: Number(r.lat),
    lng: Number(r.lon),
    osmId: r.osm_type && r.osm_id != null ? `${r.osm_type[0]!.toUpperCase()}${r.osm_id}` : undefined,
    countryCode: r.address?.country_code?.toUpperCase(),
    type: r.type,
  };
}

export async function suggestMerges(query: string): Promise<
  Array<{ placeId: string; label: string; lat: number; lng: number; score: number }>
> {
  const registry = await getPlaceRegistry();
  const candidates: Array<{ key: string; label: string; placeId: string; lat: number; lng: number }> =
    [];
  for (const [id, p] of Object.entries(registry.places)) {
    candidates.push({ key: p.label, label: p.label, placeId: id, lat: p.lat, lng: p.lng });
  }
  for (const [k, coord] of Object.entries(BUILTIN_CITIES)) {
    candidates.push({
      key: k,
      label: builtinPlace(k)?.label ?? k,
      placeId: `builtin:${k}`,
      lat: coord.lat,
      lng: coord.lng,
    });
  }
  const hits = fuzzyPlaceMatches(
    query,
    candidates.map((c) => ({ key: c.key, label: c.label })),
  );
  return hits.flatMap((h) => {
    const c = candidates.find((x) => normalizePlaceKey(x.key) === normalizePlaceKey(h.key));
    if (!c) return [];
    return [{ placeId: c.placeId, label: h.label, lat: c.lat, lng: c.lng, score: h.score }];
  });
}

export type { CityCoord };
