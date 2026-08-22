/**
 * Place an unmapped Atlas label: Nominatim search or map-click reverse.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, ErrorState, Glyph, Input, SkeletonRows } from '@vitae/ui';
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
  const titleId = useId();
  const [q, setQ] = useState(rawLabel);
  const [debounced, setDebounced] = useState(rawLabel);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The panel is deliberately not modal: the map behind it stays clickable in
  // pick mode. So it cannot borrow Sheet's focus trap, and has to put focus
  // back on the control that opened it by hand. Without this the next Tab
  // after placing a label restarts at the top of the whole application, which
  // is a full traversal per label for anyone working through the dock.
  const [opener] = useState<HTMLElement | null>(
    () => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      // Only when the panel took focus down with it. If the reader has moved
      // on to something else, leave them where they are.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, [opener]);

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
  const searching = search.isFetching;

  return (
    <div
      className="atlas__resolvemodal"
      role="dialog"
      aria-labelledby={titleId}
      aria-busy={saving || undefined}
    >
      <div className="atlas__resolvebody">
        <div className="atlas__resolvehead">
          <div>
            <h2 id={titleId} className="atlas__resolvetitle text-base">
              Place on map
            </h2>
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
            aria-pressed={!pickMode}
            onClick={() => {
              if (pickMode) onTogglePickMode();
            }}
          >
            Search
          </button>
          <button
            type="button"
            className={`graph__filter${pickMode ? ' graph__filter--on' : ''}`}
            aria-pressed={pickMode}
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
              <Input
                ref={inputRef}
                className="atlas__resolveinput"
                value={q}
                placeholder="Search places…"
                aria-label="Search places"
                onChange={(e) => setQ(e.target.value)}
              />
              {/* A request in flight used to render as an empty list, which
                  reads as "there is no such place" rather than "still
                  looking", so people retyped or gave up mid-request. */}
              {searching && <SkeletonRows rows={2} label="Searching places" />}
              {searchError && (
                <ErrorState
                  title="Search unavailable"
                  detail={searchError}
                  onRetry={() => void search.refetch()}
                  retryLabel="Retry search"
                />
              )}
              <ul className="atlas__resolvelist">
                {(search.data?.results ?? []).map((hit) => {
                  const cand: PlaceCandidate = {
                    label: shortLabel(hit.displayName),
                    lat: hit.lat,
                    lng: hit.lng,
                    osmId: hit.osmId,
                    countryCode: hit.countryCode,
                  };
                  const on = Boolean(
                    selected &&
                      !selected.placeId &&
                      selected.lat === cand.lat &&
                      selected.lng === cand.lng &&
                      selected.label === cand.label,
                  );
                  return (
                    <li key={`${hit.lat},${hit.lng},${hit.osmId ?? hit.displayName}`}>
                      <button
                        type="button"
                        className={`atlas__resolverow${on ? ' atlas__resolverow--on' : ''}`}
                        aria-pressed={on}
                        onClick={() => {
                          setSelected(cand);
                          setMergeId(null);
                          onClearMapPick();
                        }}
                      >
                        {/* The picked row was tinted with the same value hover
                            uses, so the choice was invisible under the cursor.
                            The check keeps its gutter either way, so picking
                            does not reflow the list. */}
                        <span className="atlas__resolverowtitle flex items-center gap-1">
                          <Glyph name="check" size={12} className={on ? undefined : 'invisible'} />
                          {cand.label}
                        </span>
                        <span className="u-faint atlas__resolverowsub">{hit.displayName}</span>
                      </button>
                    </li>
                  );
                })}
                {debounced.length >= 2 &&
                  !searching &&
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

          {/* The duplicate check is the only thing standing between the user
              and a second Cairo. A failure used to look exactly like "no
              duplicates found", so they confirmed and made the duplicate. */}
          {merges.isError && (
            <Banner
              tone="danger"
              title="Couldn’t check for existing places"
              action={
                <Button size="sm" onClick={() => void merges.refetch()}>
                  Retry check
                </Button>
              }
            >
              You can still place this label; it may duplicate a place you already have.
            </Banner>
          )}

          {suggestions.length > 0 && (
            <div className="atlas__resolvemerge">
              <div className="atlas__listhead">Also merge with…</div>
              <ul className="atlas__resolvelist atlas__resolvelist--compact">
                {suggestions.map((s) => {
                  const on = mergeId === s.placeId;
                  return (
                    <li key={s.placeId}>
                      <button
                        type="button"
                        className={`atlas__resolverow${on ? ' atlas__resolverow--on' : ''}`}
                        aria-pressed={on}
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
                        <span className="atlas__resolverowtitle flex items-center gap-1">
                          <Glyph name="check" size={12} className={on ? undefined : 'invisible'} />
                          {s.label}
                        </span>
                        <span className="u-faint">{Math.round(s.score * 100)}%</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* A failed POST was 11px of red text with no role, so the press
              was announced as nothing at all and people pressed again. */}
          {error && <ErrorState title="Couldn’t place this label" detail={error} />}
        </div>
      </div>

      <div className="atlas__resolvefoot">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!selected || saving}
          onClick={() => void confirm()}
        >
          {saving ? 'Saving…' : 'Confirm'}
        </Button>
      </div>
    </div>
  );
}
