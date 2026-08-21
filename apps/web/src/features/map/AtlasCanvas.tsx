import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibreMapCtor, Marker, setWorkerUrl } from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { project } from '../../lib/cities.js';
import { colorForType, type GraphPalette } from '../../lib/graph-palette.js';
import type { AtlasDisplayPrefs } from './displayPrefs.js';
import type { Corridor } from './corridors.js';
import {
  cityCoord,
  clusterPins,
  greatCircleLngLat,
  resolveCoord,
  spreadCollidingPins,
  tripArcLngLats,
} from './geo.js';
import type { MapCity, MapTrip } from './types.js';
import { NAMED_TYPES, TYPE_FILTERS } from './types.js';

// MapLibre v6 splits the worker into a stub + shared chunk; Vite must bundle it
// via ?worker&url or vector tiles never parse (black map, load never fires).
setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const ARC_SOURCE = 'atlas-arcs';
const ARC_LAYER = 'atlas-arcs-line';
const STEM_SOURCE = 'atlas-stems';
const STEM_LAYER = 'atlas-stems-line';
const CORRIDOR_SOURCE = 'atlas-corridors';
const CORRIDOR_LAYER = 'atlas-corridors-line';
const CORRIDOR_HIT = 'atlas-corridors-hit';

export interface AtlasMapHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  flyToCity: (city: MapCity) => void;
  exportPng: () => void;
}

export interface AtlasCanvasProps {
  cities: MapCity[];
  activeFilters: Set<string>;
  prefs: AtlasDisplayPrefs;
  palette: GraphPalette;
  selectedCity: string | null;
  selectedTrip: MapTrip | null;
  corridors: Corridor[];
  selectedCorridorKey: string | null;
  onSelectCorridor: (key: string | null) => void;
  onSelectCity: (city: string | null) => void;
  reducedMotion: boolean;
  /** When set, map clicks reverse-geocode instead of selecting pins. */
  pickMode?: boolean;
  onMapPick?: (lat: number, lng: number) => void;
}

function countFor(entry: MapCity, active: Set<string>): number {
  let total = 0;
  for (const [type, n] of Object.entries(entry.types)) {
    const bucket = NAMED_TYPES.has(type) ? type : 'other';
    const on =
      bucket === 'other'
        ? active.has('other')
        : active.has(TYPE_FILTERS.find((f) => f.types.includes(bucket))?.label ?? '');
    if (on) total += n;
  }
  return total;
}

function dominantType(entry: MapCity): string {
  let best = 'location';
  let max = 0;
  for (const [t, n] of Object.entries(entry.types)) {
    if (n > max) {
      max = n;
      best = t;
    }
  }
  return best;
}

function hasVisit(entry: MapCity): boolean {
  return entry.records.some((r) => r.link === 'VISITED');
}

type PinBase = {
  entry: MapCity;
  lat: number;
  lng: number;
  x: number;
  y: number;
  count: number;
};

export const AtlasCanvas = forwardRef<AtlasMapHandle, AtlasCanvasProps>(function AtlasCanvas(
  {
    cities,
    activeFilters,
    prefs,
    palette,
    selectedCity,
    selectedTrip,
    corridors,
    selectedCorridorKey,
    onSelectCorridor,
    onSelectCity,
    reducedMotion,
    pickMode = false,
    onMapPick,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const pickModeRef = useRef(pickMode);
  const onMapPickRef = useRef(onMapPick);
  const onSelectCorridorRef = useRef(onSelectCorridor);
  pickModeRef.current = pickMode;
  onMapPickRef.current = onMapPick;
  onSelectCorridorRef.current = onSelectCorridor;
  const [mapReady, setMapReady] = useState(false);
  const [mapZoom, setMapZoom] = useState(1.6);

  const pins = useMemo(() => {
    const out: PinBase[] = [];
    for (const entry of cities) {
      const count = countFor(entry, activeFilters);
      if (count === 0) continue;
      const coord = cityCoord(entry);
      if (!coord) continue;
      const { x, y } = project(coord);
      out.push({ entry, lat: coord.lat, lng: coord.lng, x, y, count });
    }
    return out;
  }, [cities, activeFilters]);

  const display = useMemo(() => {
    const clustered =
      prefs.cluster && mapZoom < 3.2
        ? clusterPins(pins, mapZoom < 2 ? 5 : 3)
        : pins.map((p) => ({ ...p, members: [p] as PinBase[] }));

    // Clustered buckets keep a single marker; unclustered (or zoomed-in) get spread.
    if (prefs.cluster && mapZoom < 3.2) {
      return clustered.map((c) => ({
        ...c,
        displayLat: c.lat,
        displayLng: c.lng,
        spread: false,
        centerLat: c.lat,
        centerLng: c.lng,
      }));
    }

    const spread = spreadCollidingPins(
      clustered.map((c) => ({ ...c, lat: c.lat, lng: c.lng })),
      mapZoom,
    );
    return spread.map((s) => ({
      ...s.pin,
      displayLat: s.lat,
      displayLng: s.lng,
      spread: s.spread,
      centerLat: s.centerLat,
      centerLng: s.centerLng,
    }));
  }, [pins, prefs.cluster, mapZoom]);

  const maxCount = Math.max(1, ...display.map((p) => p.count));
  const tripCities = useMemo(
    () => new Set(selectedTrip?.stops.map((s) => s.city.toLowerCase()) ?? []),
    [selectedTrip],
  );

  const fitToPins = () => {
    const map = mapRef.current;
    if (!map || pins.length === 0) {
      map?.easeTo({ center: [10, 20], zoom: 1.4, duration: reducedMotion ? 0 : 400 });
      return;
    }
    const bounds = new LngLatBounds();
    for (const p of pins) bounds.extend([p.lng, p.lat]);
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 60, left: 60, right: 60 },
      maxZoom: 6,
      duration: reducedMotion ? 0 : 500,
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      fit: fitToPins,
      zoomIn: () => {
        mapRef.current?.zoomIn({ duration: reducedMotion ? 0 : 200 });
      },
      zoomOut: () => {
        mapRef.current?.zoomOut({ duration: reducedMotion ? 0 : 200 });
      },
      flyToCity: (city: MapCity) => {
        const coord = cityCoord(city);
        if (!coord || !mapRef.current) return;
        mapRef.current.flyTo({
          center: [coord.lng, coord.lat],
          zoom: Math.max(mapRef.current.getZoom(), 5),
          duration: reducedMotion ? 0 : 600,
        });
      },
      exportPng: () => {
        const map = mapRef.current;
        if (!map) return;
        map.once('render', () => {
          const canvas = map.getCanvas();
          canvas.toBlob((png) => {
            if (!png) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(png);
            a.download = 'vitae-atlas.png';
            a.click();
            URL.revokeObjectURL(a.href);
          });
        });
        map.triggerRepaint();
      },
    }),
    [pins, reducedMotion],
  );

  // Init map once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new MapLibreMapCtor({
      container: el,
      style: STYLE_URL,
      center: [10, 20],
      zoom: 1.6,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    const onZoom = () => setMapZoom(map.getZoom());
    const onMapClick = (e: { lngLat: { lat: number; lng: number } }) => {
      if (pickModeRef.current && onMapPickRef.current) {
        onMapPickRef.current(e.lngLat.lat, e.lngLat.lng);
      }
    };
    const onCorridorClick = (e: {
      features?: Array<{ properties?: { key?: string } | null }> | undefined;
      originalEvent: Event;
    }) => {
      if (pickModeRef.current) return;
      const key = e.features?.[0]?.properties?.key;
      if (typeof key === 'string') {
        e.originalEvent.stopPropagation();
        onSelectCorridorRef.current(key);
      }
    };
    const onCorridorEnter = () => {
      if (!pickModeRef.current) map.getCanvas().style.cursor = 'pointer';
    };
    const onCorridorLeave = () => {
      map.getCanvas().style.cursor = pickModeRef.current ? 'crosshair' : '';
    };
    map.on('zoom', onZoom);
    map.on('click', onMapClick);
    map.on('load', () => {
      setMapReady(true);
      setMapZoom(map.getZoom());
      if (!map.getSource(CORRIDOR_SOURCE)) {
        map.addSource(CORRIDOR_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: CORRIDOR_LAYER,
          type: 'line',
          source: CORRIDOR_SOURCE,
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'selected'], 1],
              palette.accent,
              palette.borderStrong,
            ],
            // Selected corridors gain weight as well as ink: hue alone was the
            // only thing separating the one you picked from every other line.
            'line-width': [
              'case',
              ['==', ['get', 'selected'], 1],
              3.4,
              ['interpolate', ['linear'], ['get', 'count'], 1, 1.2, 5, 3.2, 12, 4.5],
            ],
            'line-opacity': [
              'case',
              ['==', ['get', 'selected'], 1],
              0.9,
              ['==', ['get', 'dim'], 1],
              0.18,
              0.4,
            ],
          },
        });
        // Wider invisible hit target for easier clicks.
        map.addLayer({
          id: CORRIDOR_HIT,
          type: 'line',
          source: CORRIDOR_SOURCE,
          paint: {
            'line-color': palette.bg,
            'line-width': 14,
            'line-opacity': 0,
          },
        });
        map.on('click', CORRIDOR_HIT, onCorridorClick);
        map.on('mouseenter', CORRIDOR_HIT, onCorridorEnter);
        map.on('mouseleave', CORRIDOR_HIT, onCorridorLeave);
      }
      if (!map.getSource(ARC_SOURCE)) {
        map.addSource(ARC_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: ARC_LAYER,
          type: 'line',
          source: ARC_SOURCE,
          paint: {
            'line-color': palette.accent,
            'line-width': 2.2,
            'line-opacity': 0.85,
            'line-dasharray': reducedMotion ? [1, 0] : [2, 1.5],
          },
        });
      }
      if (!map.getSource(STEM_SOURCE)) {
        map.addSource(STEM_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: STEM_LAYER,
          type: 'line',
          source: STEM_SOURCE,
          paint: {
            'line-color': palette.border,
            'line-width': 1,
            'line-opacity': 0.7,
          },
        });
      }
    });

    return () => {
      map.off('zoom', onZoom);
      map.off('click', onMapClick);
      if (map.getLayer(CORRIDOR_HIT)) {
        map.off('click', CORRIDOR_HIT, onCorridorClick);
        map.off('mouseenter', CORRIDOR_HIT, onCorridorEnter);
        map.off('mouseleave', CORRIDOR_HIT, onCorridorLeave);
      }
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // Fit once when pins first available after map ready.
  const didFitRef = useRef(false);
  useEffect(() => {
    if (!mapReady || didFitRef.current || pins.length === 0) return;
    didFitRef.current = true;
    fitToPins();
  }, [mapReady, pins]);

  // Trip arcs.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const src = map.getSource(ARC_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;
    if (!prefs.showArcs || !selectedTrip) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const lines = tripArcLngLats(selectedTrip);
    src.setData({
      type: 'FeatureCollection',
      features: lines.map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    });
    if (map.getLayer(ARC_LAYER)) {
      map.setPaintProperty(ARC_LAYER, 'line-dasharray', reducedMotion ? [1, 0] : [2, 1.5]);
    }
  }, [mapReady, prefs.showArcs, selectedTrip, reducedMotion]);

  // Corridor pattern layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const src = map.getSource(CORRIDOR_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;
    if (!prefs.showPatterns || corridors.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const dim = Boolean(selectedTrip && prefs.showArcs);
    const features = corridors.flatMap((c) => {
      const ca = resolveCoord(c.a);
      const cb = resolveCoord(c.b);
      // Prefer coords from cities list when available.
      const cityA = cities.find((x) => x.city.toLowerCase() === c.a.toLowerCase());
      const cityB = cities.find((x) => x.city.toLowerCase() === c.b.toLowerCase());
      const a = resolveCoord(c.a, cityA?.lat, cityA?.lng) ?? ca;
      const b = resolveCoord(c.b, cityB?.lat, cityB?.lng) ?? cb;
      if (!a || !b) return [];
      return [
        {
          type: 'Feature' as const,
          properties: {
            key: c.key,
            count: c.count,
            selected: selectedCorridorKey === c.key ? 1 : 0,
            dim: dim ? 1 : 0,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: greatCircleLngLat(a, b),
          },
        },
      ];
    });
    src.setData({ type: 'FeatureCollection', features });
  }, [
    mapReady,
    prefs.showPatterns,
    prefs.showArcs,
    corridors,
    selectedCorridorKey,
    selectedTrip,
    cities,
  ]);

  // Stem lines for spread pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const src = map.getSource(STEM_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;
    const features = display
      .filter((p) => p.spread)
      .map((p) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [p.centerLng, p.centerLat],
            [p.displayLng, p.displayLat],
          ],
        },
      }));
    src.setData({ type: 'FeatureCollection', features });
  }, [mapReady, display]);

  // Markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    for (const p of display) {
      const cityKey = p.entry.city;
      const isSel = selectedCity === cityKey;
      const onTrip = tripCities.has(cityKey.toLowerCase());
      const dimmed = Boolean(selectedTrip && !onTrip);
      const hot = p.count === maxCount && p.count > 1;
      const visited = hasVisit(p.entry);
      const tone = colorForType(palette, dominantType(p.entry));
      const wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.className = `atlas__pinwrap${dimmed ? ' atlas__pinwrap--dim' : ''}`;
      wrap.setAttribute('aria-label', `${cityKey}, ${p.count}`);
      wrap.title = `${cityKey} · ${p.count}`;

      const pin = document.createElement('span');
      pin.className = `atlas__pin${hot ? ' atlas__pin--hot' : ''}${isSel ? ' atlas__pin--sel' : ''}${visited ? ' atlas__pin--visit' : ''}`;
      pin.style.borderColor = tone;
      pin.style.background = visited ? 'transparent' : `${tone}33`;
      pin.textContent = String(p.count);
      wrap.appendChild(pin);

      if (prefs.showLabels) {
        const lab = document.createElement('span');
        lab.className = 'atlas__pinlabel';
        lab.textContent = cityKey;
        wrap.appendChild(lab);
      }

      wrap.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (pickModeRef.current && onMapPickRef.current) {
          onMapPickRef.current(p.lat, p.lng);
          return;
        }
        if (p.members.length > 1 && map.getZoom() < 4) {
          const bounds = new LngLatBounds();
          for (const m of p.members) bounds.extend([m.lng, m.lat]);
          map.fitBounds(bounds, {
            padding: 80,
            maxZoom: 7,
            duration: reducedMotion ? 0 : 450,
          });
          return;
        }
        onSelectCity(isSel ? null : cityKey);
      });

      const marker = new Marker({ element: wrap, anchor: 'bottom' })
        .setLngLat([p.displayLng, p.displayLat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [
    mapReady,
    display,
    selectedCity,
    selectedTrip,
    tripCities,
    maxCount,
    palette,
    prefs.showLabels,
    onSelectCity,
    reducedMotion,
  ]);

  return (
    <div
      className={`atlas__panel${pickMode ? ' atlas__panel--pick' : ''}`}
      role="region"
      aria-label={`Atlas map with ${pins.length} mapped ${pins.length === 1 ? 'place' : 'places'}. Use List view for the complete keyboard-readable equivalent.`}
      aria-busy={!mapReady}
    >
      <div className="atlas__map" ref={containerRef} role="presentation" />
      <span className="u-visually-hidden" role="status" aria-live="polite">
        {mapReady ? `Atlas ready with ${pins.length} mapped places` : 'Loading map tiles'}
      </span>
      <span className="atlas__attr">OpenFreeMap · MapLibre</span>
    </div>
  );
});
