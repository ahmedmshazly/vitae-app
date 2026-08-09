/**
 * Place an unmapped Atlas label: Nominatim search or map-click reverse.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api.js';

export interface NominatimHit {
  displayName: string;
  lat: number;
  lng: number;
  osmId?: string;
  countryCode?: string;
  type?: string;
}

export interface MergeSuggestion {
  placeId: string;
  label: string;
  lat: number;
  lng: number;
  score: number;
}

export interface PlaceCandidate {
  label: string;
  lat: number;
  lng: number;
  osmId?: string;
  countryCode?: string;
  placeId?: string;
}

export interface PlaceResolvePanelProps {
  rawLabel: string;
  pickMode: boolean;
  onTogglePickMode: () => void;
  /** Filled when user clicked the map in pick mode (already reverse-geocoded). */
  mapPick: PlaceCandidate | null;
  onClearMapPick: () => void;
  onClose: () => void;
  onSaved: () => void;
}

function shortLabel(displayName: string): string {
  return displayName.split(',')[0]?.trim() || displayName;
}

export function PlaceResolvePanel({
  rawLabel,
  pickMode,
  onTogglePickMode,
  mapPick,
  onClearMapPick,
  onClose,
  onSaved,
}: PlaceResolvePanelProps) {
  const [q, setQ] = useState(rawLabel);
  const [debounced, setDebounced] = useState(rawLabel);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (mapPick) {
      setSelected(mapPick);
      setMergeId(null);
    }
  }, [mapPick]);

  const search = useQuery({
    queryKey: ['places-search', debounced],
    queryFn: () => api.get<{ results: NominatimHit[] }>(`/places/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2 && !pickMode,
    retry: false,
  });

  const merges = useQuery({
    queryKey: ['places-suggest-merges', rawLabel],
    queryFn: () =>
      api.get<{ suggestions: MergeSuggestion[] }>(
        `/places/suggest-merges?q=${encodeURIComponent(rawLabel)}`,
      ),
    retry: false,
  });

  const searchError =
    search.error instanceof ApiError
      ? search.error.message
      : search.isError
        ? 'Search unavailable'
        : null;

  async function confirm() {
    const cand = selected;
    if (!cand) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/places/resolve', {
        aliases: [rawLabel],
        label: cand.label,
        lat: cand.lat,
        lng: cand.lng,
        ...(cand.osmId ? { osmId: cand.osmId } : {}),
        ...(cand.countryCode ? { countryCode: cand.countryCode } : {}),
        ...(mergeId ? { placeId: mergeId } : cand.placeId ? { placeId: cand.placeId } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const suggestions = merges.data?.suggestions ?? [];

  return (
    <div className="atlas__resolvemodal" role="dialog" aria-label={`Place ${rawLabel} on map`}>
      <div className="atlas__resolvebody">
        <div className="atlas__resolvehead">
          <div>
            <div className="atlas__resolvetitle">Place on map</div>
            <div className="u-faint atlas__resolvesub">
              Map <strong>{rawLabel}</strong> to a location
            </div>
          </div>
          <button type="button" className="vt-modal__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="atlas__resolvemodes" role="group" aria-label="Place method">
          <button
            type="button"
            className={`graph__filter${!pickMode ? ' graph__filter--on' : ''}`}
            onClick={() => {
              if (pickMode) onTogglePickMode();
            }}
          >
            Search
          </button>
          <button
            type="button"
            className={`graph__filter${pickMode ? ' graph__filter--on' : ''}`}
            onClick={() => {
              if (!pickMode) onTogglePickMode();
            }}
          >
            Pick on map
          </button>
        </div>

        <div className="atlas__resolvescroll">
          {!pickMode ? (
            <>
              <input
                className="lifemap__searchinput atlas__resolveinput"
                value={q}
                autoFocus
                placeholder="Search places…"
                aria-label="Search places"
                onChange={(e) => setQ(e.target.value)}
              />
              {searchError && <p className="atlas__resolveerr">{searchError}</p>}
              <ul className="atlas__resolvelist">
                {(search.data?.results ?? []).map((hit) => {
                  const cand: PlaceCandidate = {
                    label: shortLabel(hit.displayName),
                    lat: hit.lat,
                    lng: hit.lng,
                    osmId: hit.osmId,
                    countryCode: hit.countryCode,
                  };
                  const on =
                    selected &&
                    !selected.placeId &&
                    selected.lat === cand.lat &&
                    selected.lng === cand.lng &&
                    selected.label === cand.label;
                  return (
                    <li key={`${hit.lat},${hit.lng},${hit.osmId ?? hit.displayName}`}>
                      <button
                        type="button"
                        className={`atlas__resolverow${on ? ' atlas__resolverow--on' : ''}`}
                        onClick={() => {
                          setSelected(cand);
                          setMergeId(null);
                          onClearMapPick();
                        }}
                      >
                        <span className="atlas__resolverowtitle">{cand.label}</span>
                        <span className="u-faint atlas__resolverowsub">{hit.displayName}</span>
                      </button>
                    </li>
                  );
                })}
                {debounced.length >= 2 &&
                  !search.isFetching &&
                  (search.data?.results.length ?? 0) === 0 &&
                  !searchError && <li className="u-faint atlas__resolveempty">No results</li>}
              </ul>
            </>
          ) : (
            <div className="atlas__resolvepickhint">
              {mapPick ? (
                <p>
                  Picked <strong>{mapPick.label}</strong>
                  <span className="u-faint">
                    {' '}
                    ({mapPick.lat.toFixed(4)}, {mapPick.lng.toFixed(4)})
                  </span>
                </p>
              ) : (
                <p className="u-faint">Click the map to reverse-geocode a pin.</p>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="atlas__resolvemerge">
              <div className="atlas__listhead">Also merge with…</div>
              <ul className="atlas__resolvelist atlas__resolvelist--compact">
                {suggestions.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      className={`atlas__resolverow${mergeId === s.placeId ? ' atlas__resolverow--on' : ''}`}
                      onClick={() => {
                        setMergeId(s.placeId);
                        setSelected({
                          label: s.label,
                          lat: s.lat,
                          lng: s.lng,
                          placeId: s.placeId,
                        });
                        onClearMapPick();
                      }}
                    >
                      <span className="atlas__resolverowtitle">{s.label}</span>
                      <span className="u-faint">{Math.round(s.score * 100)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="atlas__resolveerr">{error}</p>}
        </div>
      </div>

      <div className="atlas__resolvefoot">
        <button type="button" className="graph__tool" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="graph__tool graph__tool--accent"
          disabled={!selected || saving}
          onClick={() => void confirm()}
        >
          {saving ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
