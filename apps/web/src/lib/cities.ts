/**
 * Re-export place helpers from @vitae/core (single source for Atlas + API).
 */
export {
  type CityCoord,
  lookupBuiltinCity as lookupCity,
  normalizePlaceKey,
  project,
  fuzzyPlaceMatches,
  STATIC_PLACE_ALIASES,
  BUILTIN_CITIES,
} from '@vitae/core';
