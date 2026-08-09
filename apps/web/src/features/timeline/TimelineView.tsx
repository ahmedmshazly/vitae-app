/**
 * Chronograph, career/life timeline with brush → review (FR-VIS-002/005).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { ErrorState, SkeletonRows } from '@vitae/ui';
import { api } from '../../lib/api.js';
import { todayIso } from '../../lib/dates.js';
import { entityHref } from '../../lib/entity-href.js';
import { readGraphPalette, type GraphPalette } from '../../lib/graph-palette.js';
import { useTimelineDisplayPrefs, zoomIn, zoomOut } from './displayPrefs.js';
import { TimelineCanvas } from './TimelineCanvas.js';
import { TimelineList } from './TimelineList.js';
import { reviewToMarkdown, TimelineReviewDock } from './TimelineReview.js';
import { TimelineToolbar } from './TimelineToolbar.js';
import type {
  BrushRange,
  TimelineData,
  TimelineItem,
  TimelineReviewResult,
  TimelineViewMode,
  TimelineZoom,
} from './types.js';
import { PX_PER_YEAR, yearFrac } from './types.js';

function parseZoom(v: string | null): TimelineZoom {
  if (v === 'decade' || v === 'year' || v === 'quarter' || v === 'month') return v;
  return 'year';
}

export function TimelineView() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reducedMotion = useReducedMotion() ?? false;
  const palette = useMemo<GraphPalette>(() => readGraphPalette(), []);
  const [prefs, patchPrefs, resetPrefs] = useTimelineDisplayPrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [zoom, setZoom] = useState<TimelineZoom>(() => parseZoom(params.get('zoom')));
  const [mode, setMode] = useState<TimelineViewMode>('chronograph');
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [brush, setBrush] = useState<BrushRange | null>(() => {
    const from = params.get('from');
    const to = params.get('to');
    if (from && to && from <= to) return { from, to };
    return null;
  });
  const [brushDraft, setBrushDraft] = useState<{ a: number; b: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null!);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['timeline'],
    queryFn: () => api.get<TimelineData>('/timeline'),
  });

  const { data: review, isFetching: reviewLoading, isError: reviewFailed } = useQuery({
    queryKey: ['timeline-review', brush?.from, brush?.to],
    queryFn: () =>
      api.get<TimelineReviewResult>(
        `/timeline/review?from=${encodeURIComponent(brush!.from)}&to=${encodeURIComponent(brush!.to)}`,
      ),
    enabled: Boolean(brush),
  });

  // Sync zoom/brush to URL.
  useEffect(() => {
    const next = new URLSearchParams();
    if (zoom !== 'year') next.set('zoom', zoom);
    if (brush) {
      next.set('from', brush.from);
      next.set('to', brush.to);
    }
    setParams(next, { replace: true });
  }, [zoom, brush, setParams]);

  const scrollToFrac = useCallback(
    (frac: number, behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current;
      if (!el || !data?.years.length) return;
      const min = data.years[0]!;
      const px = PX_PER_YEAR[zoom];
      const gutter = prefs.stickyLabels ? 96 : 0;
      const x = gutter + (frac - min) * px - el.clientWidth / 2;
      el.scrollTo({ left: Math.max(0, x), behavior: reducedMotion ? 'auto' : behavior });
    },
    [data, zoom, prefs.stickyLabels, reducedMotion],
  );

  const jumpToday = useCallback(() => {
    scrollToFrac(yearFrac(todayIso()));
  }, [scrollToFrac]);

  const fitCareer = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [reducedMotion]);

  useEffect(() => {
    if (!data?.years.length) return;
    const t = setTimeout(() => jumpToday(), reducedMotion ? 50 : 400);
    return () => clearTimeout(t);
  }, [data?.years, zoom]);  

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        setBrush(null);
        setSelected(null);
        setPrefsOpen(false);
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        jumpToday();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setMode((m) => (m === 'list' ? 'chronograph' : 'list'));
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => zoomIn(z));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => zoomOut(z));
      } else if (e.key === 'Enter' && selected) {
        e.preventDefault();
        navigate(entityHref(selected.type, selected.id));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jumpToday, navigate, selected]);

  // Wheel zoom when holding ctrl/meta over the scroll area.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) setZoom((z) => zoomIn(z));
      else setZoom((z) => zoomOut(z));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [data, mode]);

  function exportMarkdown() {
    if (!review) return;
    const md = reviewToMarkdown(review);
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vitae-review-${review.from}_${review.to}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (isError) {
    return (
      <div className="page">
        <ErrorState detail={(error as Error | null)?.message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="page">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const hint =
    mode === 'list'
      ? 'Chronological list twin · Enter opens · L toggles view'
      : brush
        ? `Reviewing ${brush.from} → ${brush.to} · Esc clears`
        : 'Drag to brush a season · scroll · ⌘/Ctrl+wheel zoom · T today · L list';

  return (
    <div className={`page page--chronograph${brush ? ' page--chronograph-review' : ''}`}>
      <TimelineToolbar
        zoom={zoom}
        onZoom={setZoom}
        mode={mode}
        onMode={setMode}
        prefs={prefs}
        onPatchPrefs={patchPrefs}
        prefsOpen={prefsOpen}
        onTogglePrefs={() => setPrefsOpen((o) => !o)}
        onResetPrefs={resetPrefs}
        onToday={jumpToday}
        onFit={fitCareer}
        hint={hint}
      />

      <div className="chronograph__body">
        <div className="chronograph__main">
          {data.lanes.length === 0 ? (
            <div className="empty" style={{ padding: 80 }}>
              <div className="empty__title">Nothing dated yet</div>
              <div>Add start dates to roles, projects, education, events, or trips, or import a career.</div>
            </div>
          ) : mode === 'list' ? (
            <TimelineList
              lanes={data.lanes}
              activeLanes={prefs.activeLanes}
              showMoments={prefs.showMoments}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          ) : (
            <TimelineCanvas
              lanes={data.lanes}
              years={data.years}
              zoom={zoom}
              nowIso={todayIso()}
              palette={palette}
              prefs={prefs}
              brush={brush}
              brushDraft={brushDraft}
              selectedId={selected?.id ?? null}
              reducedMotion={reducedMotion}
              scrollRef={scrollRef}
              onSelect={setSelected}
              onOpen={(item) => navigate(entityHref(item.type, item.id))}
              onBrushDraft={setBrushDraft}
              onBrushCommit={setBrush}
            />
          )}
        </div>

        {brush && mode === 'chronograph' && (
          <TimelineReviewDock
            review={review}
            loading={reviewLoading}
            failed={reviewFailed}
            onClear={() => setBrush(null)}
            onExportMarkdown={exportMarkdown}
          />
        )}
      </div>

      {selected && mode === 'chronograph' && (
        <div className="tl__peek" role="status">
          <strong>{selected.title}</strong>
          {selected.subtitle ? <span className="u-faint"> · {selected.subtitle}</span> : null}
          <span className="u-faint">
            {' '}
            · {selected.start}
            {selected.end ? ` → ${selected.end}` : selected.current ? ' → now' : ''}
          </span>
          <button
            type="button"
            className="graph__tool"
            style={{ marginLeft: 8 }}
            onClick={() => navigate(entityHref(selected.type, selected.id))}
          >
            Open
          </button>
        </div>
      )}
    </div>
  );
}

export default TimelineView;
