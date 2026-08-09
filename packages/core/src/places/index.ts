/**
 * Place name normalization + static transliteration aliases + fuzzy match
 * helpers for Atlas (FR-VIS-003 place resolve).
 */
export interface CityCoord {
  lat: number;
  lng: number;
}

/** Collapse spelling variants for registry keys and lookups. */
export function normalizePlaceKey(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Seed aliases → canonical label (normalized). Merged under user registry.
 * Keys and values are both normalized place keys; display labels live elsewhere.
 */
export const STATIC_PLACE_ALIASES: Record<string, string> = {
  // Egypt / MENA transliterations
  asyut: 'asyut',
  assiut: 'asyut',
  assyout: 'asyut',
  asiut: 'asyut',
  luxor: 'luxor',
  'al uqsur': 'luxor',
  aswan: 'aswan',
  assuan: 'aswan',
  giza: 'giza',
  gizeh: 'giza',
  'al jizah': 'giza',
  cairo: 'cairo',
  'al qahirah': 'cairo',
  'al qahira': 'cairo',
  kahira: 'cairo',
  alexandria: 'alexandria',
  'al iskandariyah': 'alexandria',
  iskandariya: 'alexandria',
  alex: 'alexandria',
  mansoura: 'mansoura',
  'al mansurah': 'mansoura',
  mansurah: 'mansoura',
  tanta: 'tanta',
  'port said': 'port said',
  'bur said': 'port said',
  suez: 'suez',
  'as suways': 'suez',
  'sharm el sheikh': 'sharm el sheikh',
  sharm: 'sharm el sheikh',
  hurghada: 'hurghada',
  // Common city aliases
  'sao paulo': 'sao paulo',
  nyc: 'new york',
  'new york city': 'new york',
  sf: 'san francisco',
  'san fran': 'san francisco',
  la: 'los angeles',
  'washington dc': 'washington',
  'washington d c': 'washington',
  mumbai: 'mumbai',
  bombay: 'mumbai',
  delhi: 'delhi',
  'new delhi': 'delhi',
  beijing: 'beijing',
  peking: 'beijing',
  kolkata: 'kolkata',
  calcutta: 'kolkata',
  chennai: 'chennai',
  madras: 'chennai',
};

/** Built-in city centers (same table the web Map used to own). */
export const BUILTIN_CITIES: Record<string, CityCoord> = {
  cairo: { lat: 30.04, lng: 31.24 },
  giza: { lat: 29.99, lng: 31.13 },
  alexandria: { lat: 31.2, lng: 29.92 },
  asyut: { lat: 27.18, lng: 31.18 },
  luxor: { lat: 25.69, lng: 32.64 },
  aswan: { lat: 24.09, lng: 32.9 },
  mansoura: { lat: 31.04, lng: 31.38 },
  tanta: { lat: 30.79, lng: 31.0 },
  'port said': { lat: 31.27, lng: 32.3 },
  suez: { lat: 29.97, lng: 32.55 },
  'sharm el sheikh': { lat: 27.92, lng: 34.33 },
  hurghada: { lat: 27.26, lng: 33.81 },
  casablanca: { lat: 33.57, lng: -7.59 },
  tunis: { lat: 36.81, lng: 10.18 },
  dubai: { lat: 25.2, lng: 55.27 },
  'abu dhabi': { lat: 24.45, lng: 54.38 },
  doha: { lat: 25.29, lng: 51.53 },
  riyadh: { lat: 24.71, lng: 46.68 },
  jeddah: { lat: 21.49, lng: 39.19 },
  'kuwait city': { lat: 29.38, lng: 47.99 },
  amman: { lat: 31.95, lng: 35.93 },
  beirut: { lat: 33.89, lng: 35.5 },
  'tel aviv': { lat: 32.09, lng: 34.78 },
  istanbul: { lat: 41.01, lng: 28.98 },
  london: { lat: 51.51, lng: -0.13 },
  paris: { lat: 48.86, lng: 2.35 },
  berlin: { lat: 52.52, lng: 13.41 },
  munich: { lat: 48.14, lng: 11.58 },
  amsterdam: { lat: 52.37, lng: 4.9 },
  brussels: { lat: 50.85, lng: 4.35 },
  zurich: { lat: 47.38, lng: 8.54 },
  vienna: { lat: 48.21, lng: 16.37 },
  prague: { lat: 50.08, lng: 14.44 },
  warsaw: { lat: 52.23, lng: 21.01 },
  stockholm: { lat: 59.33, lng: 18.07 },
  copenhagen: { lat: 55.68, lng: 12.57 },
  oslo: { lat: 59.91, lng: 10.75 },
  helsinki: { lat: 60.17, lng: 24.94 },
  dublin: { lat: 53.35, lng: -6.26 },
  edinburgh: { lat: 55.95, lng: -3.19 },
  lisbon: { lat: 38.72, lng: -9.14 },
  madrid: { lat: 40.42, lng: -3.7 },
  barcelona: { lat: 41.39, lng: 2.17 },
  rome: { lat: 41.9, lng: 12.5 },
  milan: { lat: 45.46, lng: 9.19 },
  athens: { lat: 37.98, lng: 23.73 },
  moscow: { lat: 55.76, lng: 37.62 },
  lagos: { lat: 6.52, lng: 3.38 },
  nairobi: { lat: -1.29, lng: 36.82 },
  'cape town': { lat: -33.92, lng: 18.42 },
  johannesburg: { lat: -26.2, lng: 28.05 },
  'new york': { lat: 40.71, lng: -74.01 },
  'san francisco': { lat: 37.77, lng: -122.42 },
  'los angeles': { lat: 34.05, lng: -118.24 },
  seattle: { lat: 47.61, lng: -122.33 },
  boston: { lat: 42.36, lng: -71.06 },
  chicago: { lat: 41.88, lng: -87.63 },
  austin: { lat: 30.27, lng: -97.74 },
  denver: { lat: 39.74, lng: -104.99 },
  miami: { lat: 25.76, lng: -80.19 },
  atlanta: { lat: 33.75, lng: -84.39 },
  washington: { lat: 38.91, lng: -77.04 },
  toronto: { lat: 43.65, lng: -79.38 },
  vancouver: { lat: 49.28, lng: -123.12 },
  montreal: { lat: 45.5, lng: -73.57 },
  'mexico city': { lat: 19.43, lng: -99.13 },
  'sao paulo': { lat: -23.55, lng: -46.63 },
  'buenos aires': { lat: -34.6, lng: -58.38 },
  mumbai: { lat: 19.08, lng: 72.88 },
  delhi: { lat: 28.61, lng: 77.21 },
  bangalore: { lat: 12.97, lng: 77.59 },
  karachi: { lat: 24.86, lng: 67.0 },
  lahore: { lat: 31.55, lng: 74.34 },
  singapore: { lat: 1.35, lng: 103.82 },
  'kuala lumpur': { lat: 3.14, lng: 101.69 },
  jakarta: { lat: -6.21, lng: 106.85 },
  bangkok: { lat: 13.76, lng: 100.5 },
  manila: { lat: 14.6, lng: 120.98 },
  'ho chi minh city': { lat: 10.82, lng: 106.63 },
  hanoi: { lat: 21.03, lng: 105.85 },
  'hong kong': { lat: 22.32, lng: 114.17 },
  shanghai: { lat: 31.23, lng: 121.47 },
  beijing: { lat: 39.9, lng: 116.41 },
  shenzhen: { lat: 22.54, lng: 114.06 },
  seoul: { lat: 37.57, lng: 126.98 },
  tokyo: { lat: 35.68, lng: 139.69 },
  osaka: { lat: 34.69, lng: 135.5 },
  kyoto: { lat: 35.01, lng: 135.77 },
  sydney: { lat: -33.87, lng: 151.21 },
  melbourne: { lat: -37.81, lng: 144.96 },
  auckland: { lat: -36.85, lng: 174.76 },
  kolkata: { lat: 22.57, lng: 88.36 },
  chennai: { lat: 13.08, lng: 80.27 },
};

export function lookupBuiltinCity(name: string): CityCoord | null {
  const key = normalizePlaceKey(name);
  const viaAlias = STATIC_PLACE_ALIASES[key] ?? key;
  return BUILTIN_CITIES[viaAlias] ?? BUILTIN_CITIES[key] ?? null;
}

export function project(coord: CityCoord): { x: number; y: number } {
  return {
    x: ((coord.lng + 180) / 360) * 100,
    y: ((90 - coord.lat) / 180) * 100,
  };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

export interface FuzzyPlaceHit {
  key: string;
  label: string;
  score: number;
}

/** Suggest near-duplicate place keys (registry labels + builtins). */
export function fuzzyPlaceMatches(
  query: string,
  candidates: Array<{ key: string; label: string }>,
  limit = 5,
): FuzzyPlaceHit[] {
  const q = normalizePlaceKey(query);
  if (!q) return [];
  const scored: FuzzyPlaceHit[] = [];
  for (const c of candidates) {
    const k = normalizePlaceKey(c.key);
    if (!k || k === q) continue;
    let score = 0;
    if (k.includes(q) || q.includes(k)) score = 0.85;
    else {
      const dist = levenshtein(q, k);
      const maxLen = Math.max(q.length, k.length);
      score = 1 - dist / maxLen;
      // Transliteration variants (Assiut/Asyut) are often 1-2 edits on short keys.
      if (dist <= 2 && maxLen <= 12) score = Math.max(score, 0.78);
    }
    if (score >= 0.72) scored.push({ key: c.key, label: c.label, score });
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit);
}
