/**
 * Atlas, navigable life map of places (FR-VIS-003).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { EmptyState, ErrorState, SkeletonRows, StatusTrace } from '@vitae/ui';
import { useToast } from '../Toast.js';
import { api } from '../../lib/api.js';
import { readGraphPalette, type GraphPalette } from '../../lib/graph-palette.js';
import { AtlasCanvas, type AtlasMapHandle } from './AtlasCanvas.js';
import { AtlasCompareDock } from './AtlasCompareDock.js';
import { AtlasCorridorDock } from './AtlasCorridorDock.js';
import { AtlasDossier } from './AtlasDossier.js';
import { AtlasList } from './AtlasList.js';
import { AtlasToolbar } from './AtlasToolbar.js';
import { PlaceResolvePanel, type PlaceCandidate } from './PlaceResolvePanel.js';
import { UnmappedDock } from './UnmappedDock.js';
import {
  buildCorridors,
  capCorridors,
  cityKey,
  corridorPeople,
  findCorridor,
  sharedPeople,
  tripsForCorridor,
  tripsLinkingCities,
} from './corridors.js';
import { useAtlasDisplayPrefs } from './displayPrefs.js';
import { cityCoord, cityScreenPos } from './geo.js';
import type { AtlasPeriod, AtlasViewMode, MapCity, MapData, MapTrip } from './types.js';
import { TYPE_FILTERS } from './types.js';

function initialPeriod(params: URLSearchParams): AtlasPeriod {
  if (params.get('from') || params.get('to')) return 'custom';
  return 'all';
}

function shortLabel(displayName: string): string {
  return displayName.split(',')[0]?.trim() || displayName;
}

interface NominatimHit {
  displayName: string;
  lat: number;
  lng: number;
  osmId?: string;
  countryCode?: string;
}

export function AtlasView() {
  const queryClient = useQueryClient();
  const { flash } = useToast();
  const [params, setParams] = useSearchParams();
  const reducedMotion = useReducedMotion() ?? false;
  const palette = useMemo<GraphPalette>(() => readGraphPalette(), []);
  const [prefs, patchPrefs, resetPrefs] = useAtlasDisplayPrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [mode, setMode] = useState<AtlasViewMode>('atlas');
  const [activeFilters, setActiveFilters] = useState(
    () => new Set(TYPE_FILTERS.map((f) => f.label)),
  );
  const [period, setPeriod] = useState<AtlasPeriod>(() => initialPeriod(params));
  const year = new Date().getFullYear();
  const [customFrom, setCustomFrom] = useState(() => params.get('from') ?? `${year}-01-01`);
  const [customTo, setCustomTo] = useState(() => params.get('to') ?? `${year}-12-31`);
  const [selectedCity, setSelectedCity] = useState<string | null>(() => params.get('city'));
  const [selectedTripId, setSelectedTripId] = useState<string | null>(() => params.get('trip'));
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [unmappedDockOpen, setUnmappedDockOpen] = useState(false);
  const [resolvingLabel, setResolvingLabel] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [mapPick, setMapPick] = useState<PlaceCandidate | null>(null);
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<string | null>(null);
  const [comparePair, setComparePair] = useState<{ a: string; b: string } | null>(null);
  const [comparePickFrom, setComparePickFrom] = useState<string | null>(null);
  const mapHandle = useRef<AtlasMapHandle>(null);

  const range = useMemo(() => {
    if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
    if (period === 'custom') {
      return {
        from: customFrom || undefined,
        to: customTo || undefined,
      };
    }
    return {};
  }, [period, year, customFrom, customTo]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['map', range.from ?? null, range.to ?? null],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      const q = qs.toString();
      return api.get<MapData>(q ? `/map?${q}` : '/map');
    },
  });

  const selectedTrip = useMemo(() => {
    if (!selectedTripId || !data) return null;
    return data.trips.find((t) => t.id === selectedTripId) ?? null;
  }, [data, selectedTripId]);

  const allCorridors = useMemo(() => buildCorridors(data?.trips ?? []), [data?.trips]);
  const drawCorridors = useMemo(
    () => capCorridors(allCorridors, 80, selectedCorridorKey),
    [allCorridors, selectedCorridorKey],
  );
  const selectedCorridor = useMemo(
    () =>
      selectedCorridorKey
        ? (allCorridors.find((c) => c.key === selectedCorridorKey) ?? null)
        : null,
    [allCorridors, selectedCorridorKey],
  );

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedCity) next.set('city', selectedCity);
    if (selectedTripId) next.set('trip', selectedTripId);
    if (range.from) next.set('from', range.from);
    if (range.to) next.set('to', range.to);
    setParams(next, { replace: true });
  }, [selectedCity, selectedTripId, range.from, range.to, setParams]);

  const companionTitles = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.cities ?? []) {
      for (const r of c.records) {
        if (r.type === 'person') m.set(r.id, r.title);
      }
    }
    return m;
  }, [data]);

  const selectedEntry = useMemo(
    () => (selectedCity ? (data?.cities.find((c) => c.city === selectedCity) ?? null) : null),
    [data, selectedCity],
  );

  const tripsHere = useMemo(() => {
    if (!selectedCity || !data) return [];
    const key = selectedCity.toLowerCase();
    return data.trips.filter((t) => t.stops.some((s) => s.city.toLowerCase() === key));
  }, [data, selectedCity]);

  const unmappedCities = useMemo(() => {
    if (!data) return [];
    return data.cities.filter((c) => !cityScreenPos(c).mapped);
  }, [data]);

  const unmappedCount = unmappedCities.length;

  useEffect(() => {
    if (unmappedCount === 0) setUnmappedDockOpen(false);
  }, [unmappedCount]);

  const openPlace = useCallback((label: string) => {
    setResolvingLabel(label);
    setPickMode(false);
    setMapPick(null);
    setMode('atlas');
    setUnmappedDockOpen(true);
    setSelectedCorridorKey(null);
    setComparePair(null);
    setComparePickFrom(null);
    setFindOpen(false);
    setPrefsOpen(false);
  }, []);

  const closeResolve = useCallback(() => {
    setResolvingLabel(null);
    setPickMode(false);
    setMapPick(null);
  }, []);

  const onMapPickCoords = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await api.get<{ result: NominatimHit | null }>(
        `/places/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );
      const hit = res.result;
      setMapPick({
        label: hit ? shortLabel(hit.displayName) : `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        lat: hit?.lat ?? lat,
        lng: hit?.lng ?? lng,
        osmId: hit?.osmId,
        countryCode: hit?.countryCode,
      });
    } catch {
      setMapPick({
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        lat,
        lng,
      });
    }
  }, []);

  const flyToCity = useCallback((city: MapCity) => {
    setSelectedCity(city.city);
    if (cityCoord(city)) mapHandle.current?.flyToCity(city);
  }, []);

  const selectTrip = useCallback((trip: MapTrip | null) => {
    setSelectedTripId(trip?.id ?? null);
    if (trip) {
      setSelectedCity(null);
      setSelectedCorridorKey(null);
      setComparePair(null);
      setComparePickFrom(null);
      setUnmappedDockOpen(false);
    }
  }, []);

  const selectCorridor = useCallback((key: string | null) => {
    setSelectedCorridorKey(key);
    if (key) {
      setSelectedCity(null);
      setSelectedTripId(null);
      setComparePair(null);
      setComparePickFrom(null);
      setUnmappedDockOpen(false);
      setFindOpen(false);
    }
  }, []);

  const startCompare = useCallback((fromCity: string) => {
    setComparePickFrom(fromCity);
    setComparePair(null);
    setSelectedCorridorKey(null);
    setSelectedTripId(null);
    setUnmappedDockOpen(false);
    setSelectedCity(fromCity);
    setMode('atlas');
  }, []);

  const openCompare = useCallback((a: string, b: string) => {
    setComparePair({ a, b });
    setComparePickFrom(null);
    setSelectedCorridorKey(null);
    setSelectedTripId(null);
    setSelectedCity(null);
    setUnmappedDockOpen(false);
  }, []);

  const handleSelectCity = useCallback(
    (c: string | null) => {
      if (pickMode) return;
      if (c && comparePickFrom) {
        if (cityKey(c) === cityKey(comparePickFrom)) {
          setSelectedCity(c);
          return;
        }
        openCompare(comparePickFrom, c);
        return;
      }
      setSelectedTripId(null);
      setSelectedCorridorKey(null);
      setComparePair(null);
      setUnmappedDockOpen(false);
      setSelectedCity(c);
    },
    [pickMode, comparePickFrom, openCompare],
  );

  const toggleFind = useCallback(() => {
    setFindOpen((o) => {
      if (!o) {
        setPrefsOpen(false);
        setMode('atlas');
      }
      return !o;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          setFindOpen(false);
          closeResolve();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
        setPrefsOpen(false);
        setMode('atlas');
        return;
      }
      if (e.key === 'Escape') {
        if (resolvingLabel) {
          closeResolve();
          return;
        }
        if (findOpen) {
          setFindOpen(false);
          return;
        }
        if (prefsOpen) {
          setPrefsOpen(false);
          return;
        }
        if (comparePickFrom) {
          setComparePickFrom(null);
          return;
        }
        if (comparePair) {
          setComparePair(null);
          return;
        }
        if (selectedCorridorKey) {
          setSelectedCorridorKey(null);
          return;
        }
        if (unmappedDockOpen) {
          setUnmappedDockOpen(false);
          return;
        }
        setSelectedCity(null);
        setSelectedTripId(null);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setFindOpen(true);
        setPrefsOpen(false);
        setMode('atlas');
      } else if (e.key === '0') {
        mapHandle.current?.fit();
      } else if (e.key === 'l' || e.key === 'L') {
        setMode((m) => (m === 'list' ? 'atlas' : 'list'));
      } else if (e.key === '+' || e.key === '=') {
        mapHandle.current?.zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        mapHandle.current?.zoomOut();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    resolvingLabel,
    unmappedDockOpen,
    findOpen,
    prefsOpen,
    closeResolve,
    comparePickFrom,
    comparePair,
    selectedCorridorKey,
  ]);

  if (isError) {
    return (
      <div className="page page--atlas explore-instrument-state">
        <header className="explore-instrument-state__head">
          <h1 className="lifemap__title">Atlas</h1>
          <StatusTrace
            tone="danger"
            label="Place evidence unavailable"
            detail="The map index could not be read"
          />
        </header>
        <div className="explore-instrument-state__body">
          <ErrorState
            title="Couldn’t assemble the Atlas"
            detail={(error as Error | null)?.message}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="page page--atlas explore-instrument-state" aria-busy="true">
        <header className="explore-instrument-state__head">
          <h1 className="lifemap__title">Atlas</h1>
          <StatusTrace
            tone="live"
            label="Assembling place evidence"
            detail="Reading places, trips, and coordinates"
          />
        </header>
        <div className="explore-instrument-state__body">
          <SkeletonRows rows={8} label="Assembling the Atlas" />
        </div>
      </div>
    );
  }

  const hint = pickMode
    ? 'Choose a point on the map; press Escape to cancel'
    : comparePickFrom
      ? `Choose another place to compare with ${comparePickFrom}`
      : selectedCorridor
        ? `Inspecting the recorded corridor between ${selectedCorridor.a} and ${selectedCorridor.b}`
        : comparePair
          ? `Comparing evidence from ${comparePair.a} and ${comparePair.b}`
          : selectedTrip
            ? `Following the recorded route for ${selectedTrip.title}`
            : selectedCity
              ? `Inspecting the records connected to ${selectedCity}`
              : 'Explore where your work, relationships, and journeys meet';

  const findHits = findOpen
    ? data.cities
        .filter((c) => c.city.toLowerCase().includes(findQ.trim().toLowerCase()))
        .slice(0, 12)
    : [];

  const showMap = mode === 'atlas' && !(data.cities.length === 0 && data.trips.length === 0);

  const corridorTrips = selectedCorridor ? tripsForCorridor(data.trips, selectedCorridor) : [];
  const corridorPeopleList = selectedCorridor
    ? corridorPeople(selectedCorridor, data.cities, companionTitles)
    : [];

  const compareShared = comparePair ? sharedPeople(data.cities, comparePair.a, comparePair.b) : [];
  const compareTrips = comparePair
    ? tripsLinkingCities(data.trips, comparePair.a, comparePair.b)
    : [];
  const compareCorridor = comparePair
    ? findCorridor(allCorridors, comparePair.a, comparePair.b)
    : null;

  const showUnmapped = unmappedDockOpen && !resolvingLabel;
  const showCorridor = Boolean(selectedCorridor) && !showUnmapped && !comparePair;
  const showCompare = Boolean(comparePair) && !showUnmapped;
  const showDossier =
    !showUnmapped &&
    !showCorridor &&
    !showCompare &&
    !comparePickFrom &&
    (selectedEntry || selectedTrip);

  const selectedContext = selectedTrip
    ? `route ${selectedTrip.title}`
    : selectedCity
      ? `place ${selectedCity}`
      : selectedCorridor
        ? `corridor ${selectedCorridor.a} ↔ ${selectedCorridor.b}`
        : comparePair
          ? `compare ${comparePair.a} · ${comparePair.b}`
          : undefined;

  return (
    <div className="page page--atlas">
      <AtlasToolbar
        mode={mode}
        onMode={setMode}
        activeFilters={activeFilters}
        onToggleFilter={(label) =>
          setActiveFilters((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
          })
        }
        period={period}
        onPeriod={setPeriod}
        year={year}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
        prefs={prefs}
        onPatchPrefs={patchPrefs}
        prefsOpen={prefsOpen}
        onTogglePrefs={() => setPrefsOpen((o) => !o)}
        onClosePrefs={() => setPrefsOpen(false)}
        onResetPrefs={resetPrefs}
        onExportPng={() => mapHandle.current?.exportPng()}
        onFind={toggleFind}
        findOpen={findOpen}
        hint={hint}
        unmappedCount={unmappedCount}
        unmappedDockOpen={unmappedDockOpen}
        cityCount={data.cities.length}
        tripCount={data.trips.length}
        selectedContext={selectedContext}
        onUnmappedClick={() => {
          setUnmappedDockOpen((o) => !o);
          setPrefsOpen(false);
          setFindOpen(false);
          setSelectedCorridorKey(null);
          setComparePair(null);
          setComparePickFrom(null);
        }}
      />

      <div className="atlas__body">
        <div className="atlas__main">
          {mode === 'list' ? (
            <AtlasList
              cities={data.cities}
              trips={data.trips}
              selectedCity={selectedCity}
              onSelectCity={(c) => {
                const entry = data.cities.find((x) => x.city === c);
                if (entry) flyToCity(entry);
                setMode('atlas');
              }}
              onSelectTrip={(t) => {
                selectTrip(t);
                setMode('atlas');
              }}
              onPlaceUnmapped={openPlace}
              filterQuery={findQ}
              onFilterQuery={setFindQ}
            />
          ) : data.cities.length === 0 && data.trips.length === 0 ? (
            <EmptyState
              className="explore-instrument__empty"
              glyph="map"
              title="No places yet"
              hint="Add a city to a person, organization, trip, or event; the Atlas will connect the evidence."
              action={
                <Link className="vt-btn vt-btn--sm" to="/data/imports">
                  Import records
                </Link>
              }
            />
          ) : (
            <AtlasCanvas
              ref={mapHandle}
              cities={data.cities}
              activeFilters={activeFilters}
              prefs={prefs}
              palette={palette}
              selectedCity={selectedCity}
              selectedTrip={selectedTrip}
              corridors={drawCorridors}
              selectedCorridorKey={selectedCorridorKey}
              onSelectCorridor={selectCorridor}
              onSelectCity={handleSelectCity}
              reducedMotion={reducedMotion}
              pickMode={pickMode}
              onMapPick={(lat, lng) => void onMapPickCoords(lat, lng)}
            />
          )}

          {showMap && (
            <div className="atlas__hud" role="group" aria-label="Map camera">
              <button
                type="button"
                className="atlas__hudbtn"
                onClick={() => mapHandle.current?.fit()}
              >
                Fit
              </button>
              <button
                type="button"
                className="atlas__hudbtn"
                onClick={() => mapHandle.current?.zoomIn()}
              >
                +
              </button>
              <button
                type="button"
                className="atlas__hudbtn"
                onClick={() => mapHandle.current?.zoomOut()}
              >
                −
              </button>
            </div>
          )}

          {pickMode && (
            <div className="atlas__pickbanner" role="status">
              Click the map to place <strong>{resolvingLabel}</strong> · Esc cancels
            </div>
          )}

          {comparePickFrom && !pickMode && (
            <div className="atlas__pickbanner" role="status">
              Select another place to compare with <strong>{comparePickFrom}</strong> · Esc cancels
            </div>
          )}

          {findOpen && mode === 'atlas' && (
            <div className="atlas__find" role="search">
              <input
                className="lifemap__searchinput"
                autoFocus
                value={findQ}
                placeholder="Find place…"
                aria-label="Find place"
                onChange={(e) => setFindQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setFindOpen(false);
                  if (e.key === 'Enter' && findHits[0]) {
                    flyToCity(findHits[0]!);
                    setFindOpen(false);
                    setMode('atlas');
                  }
                }}
              />
              <ul className="lifemap__searchlist">
                {findHits.map((c) => (
                  <li key={c.city}>
                    <button
                      type="button"
                      className="lifemap__searchrow"
                      onClick={() => {
                        flyToCity(c);
                        setFindOpen(false);
                        setMode('atlas');
                      }}
                    >
                      <span>{c.city}</span>
                      <span className="u-faint">{c.count}</span>
                    </button>
                  </li>
                ))}
                {findQ.trim() && findHits.length === 0 && (
                  <li className="lifemap__searchempty">No places match “{findQ.trim()}”</li>
                )}
              </ul>
            </div>
          )}

          {resolvingLabel && (
            <PlaceResolvePanel
              rawLabel={resolvingLabel}
              pickMode={pickMode}
              onTogglePickMode={() => {
                setPickMode((p) => !p);
                setMapPick(null);
                setMode('atlas');
              }}
              mapPick={mapPick}
              onClearMapPick={() => setMapPick(null)}
              onClose={closeResolve}
              onSaved={() => {
                const placed = resolvingLabel;
                closeResolve();
                void queryClient.invalidateQueries({ queryKey: ['map'] });
                // The panel just closed and the pin appeared somewhere off
                // screen: the only write on this screen reported nothing.
                flash(`Placed ${placed} on the map`);
              }}
            />
          )}
        </div>

        {showUnmapped && (
          <UnmappedDock
            cities={unmappedCities}
            onPlace={openPlace}
            onClose={() => setUnmappedDockOpen(false)}
          />
        )}

        {showCorridor && selectedCorridor && (
          <AtlasCorridorDock
            corridor={selectedCorridor}
            trips={corridorTrips}
            people={corridorPeopleList}
            onClose={() => setSelectedCorridorKey(null)}
            onSelectTrip={(t) => selectTrip(t)}
            onCompare={() => openCompare(selectedCorridor.a, selectedCorridor.b)}
          />
        )}

        {showCompare && comparePair && (
          <AtlasCompareDock
            cityA={comparePair.a}
            cityB={comparePair.b}
            shared={compareShared}
            linkingTrips={compareTrips}
            corridor={compareCorridor}
            onClose={() => setComparePair(null)}
            onSelectTrip={(t) => selectTrip(t)}
            onOpenCorridor={() => {
              if (!compareCorridor) return;
              setComparePair(null);
              selectCorridor(compareCorridor.key);
            }}
          />
        )}

        {showDossier && (
          <AtlasDossier
            city={selectedTrip ? null : selectedEntry}
            trip={selectedTrip}
            tripsHere={tripsHere}
            companionTitles={companionTitles}
            onClose={() => {
              setSelectedCity(null);
              setSelectedTripId(null);
            }}
            onSelectTrip={selectTrip}
            onCopyLink={() => {
              if (!selectedCity) return;
              const url = `${window.location.origin}/explore/atlas?city=${encodeURIComponent(selectedCity)}`;
              if (!navigator.clipboard) {
                flash('Couldn’t reach the clipboard.', { variant: 'error' });
                return;
              }
              void navigator.clipboard
                .writeText(url)
                .then(() => flash(`Copied a link to ${selectedCity}`))
                .catch(() => flash('Couldn’t reach the clipboard.', { variant: 'error' }));
            }}
            onCompare={
              selectedEntry && !selectedTrip ? () => startCompare(selectedEntry.city) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

export default AtlasView;
