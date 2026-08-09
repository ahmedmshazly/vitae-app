import { type PointerEvent, type RefObject } from 'react';
import { colorForType, withAlpha, type GraphPalette } from '../../lib/graph-palette.js';
import type { TimelineDisplayPrefs } from './displayPrefs.js';
import type { BrushRange, TimelineItem, TimelineLane, TimelineZoom } from './types.js';
import { PX_PER_YEAR, stackRows, yearFrac } from './types.js';

export interface TimelineCanvasProps {
  lanes: TimelineLane[];
  years: number[];
  zoom: TimelineZoom;
  nowIso: string;
  palette: GraphPalette;
  prefs: TimelineDisplayPrefs;
  brush: BrushRange | null;
  brushDraft: { a: number; b: number } | null;
  selectedId: string | null;
  reducedMotion: boolean;
  onSelect: (item: TimelineItem) => void;
  onOpen: (item: TimelineItem) => void;
  onBrushDraft: (draft: { a: number; b: number } | null) => void;
  onBrushCommit: (range: BrushRange) => void;
  scrollRef: RefObject<HTMLDivElement>;
}

function barTone(
  item: TimelineItem,
  palette: GraphPalette,
): { bg: string; border: string; fg: string } {
  const base = colorForType(palette, item.type);
  if (item.current) {
    // Was a hardcoded rgba(83,133,212,0.22), a blue belonging to no token,
    // and the only thing marking "still going". The bar carries "→ now" in its
    // name as well, so the tint is not doing the work by itself.
    return { bg: withAlpha(palette.accent, 0.18), border: palette.accent, fg: palette.fg };
  }
  // `${base}22` string-concatenated an alpha suffix onto the token, which is
  // valid only while every viz token is six-digit hex.
  return { bg: withAlpha(base, 0.13), border: base, fg: palette.fg };
}

/** Everything the bar knows, for the people who cannot see where it sits. */
export function itemLabel(item: TimelineItem): string {
  const when = item.end ? `${item.start} to ${item.end}` : item.current ? `${item.start} to now` : item.start;
  return [item.title, item.subtitle, when].filter(Boolean).join(' · ');
}

export function TimelineCanvas({
  lanes,
  years,
  zoom,
  nowIso,
  palette,
  prefs,
  brush,
  brushDraft,
  selectedId,
  reducedMotion: _reducedMotion,
  onSelect,
  onOpen,
  onBrushDraft,
  onBrushCommit,
  scrollRef,
}: TimelineCanvasProps) {
  const min = years[0] ?? new Date().getFullYear() - 1;
  const span = Math.max(years.length, 1);
  const px = PX_PER_YEAR[zoom];
  const innerWidth = span * px;
  const nowFrac = yearFrac(nowIso);
  const rowH = prefs.density === 'compact' ? 22 : 28;

  const brushLeft = brush
    ? (yearFrac(brush.from) - min) * px
    : brushDraft
      ? (Math.min(brushDraft.a, brushDraft.b) - min) * px
      : null;
  const brushWidth =
    brush
      ? Math.max((yearFrac(brush.to) - yearFrac(brush.from)) * px, 4)
      : brushDraft
        ? Math.max(Math.abs(brushDraft.b - brushDraft.a) * px, 4)
        : null;

  function endOf(i: TimelineItem): number {
    if (i.end) return yearFrac(i.end);
    if (i.current) return nowFrac;
    return yearFrac(i.start) + (i.kind === 'moment' ? 0.02 : 0.15);
  }

  function onTrackPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // Don't start brush when clicking a bar/moment
    const target = e.target as HTMLElement;
    if (target.closest('.tl__bar, .tl__moment')) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollLeft;
    const frac = min + x / px;
    track.setPointerCapture(e.pointerId);
    onBrushDraft({ a: frac, b: frac });
  }

  function onTrackPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!brushDraft) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollLeft;
    const frac = min + x / px;
    onBrushDraft({ a: brushDraft.a, b: frac });
  }

  function onTrackPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!brushDraft) return;
    const a = Math.min(brushDraft.a, brushDraft.b);
    const b = Math.max(brushDraft.a, brushDraft.b);
    onBrushDraft(null);
    if (b - a < 0.02) return; // click, not drag
    const from = fracToIsoClamped(a, years);
    const to = fracToIsoClamped(b, years);
    onBrushCommit({ from, to });
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const visibleLanes = lanes.filter((l) => prefs.activeLanes.includes(l.name));

  return (
    <div className="tl__scroll" ref={scrollRef}>
      <div
        className="tl__inner"
        style={{ minWidth: innerWidth + (prefs.stickyLabels ? 96 : 0) }}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        onPointerCancel={() => onBrushDraft(null)}
      >
        <div className={`tl__years${prefs.stickyLabels ? ' tl__years--sticky' : ''}`}>
          <span className="tl__lanegutter" aria-hidden />
          <div className="tl__yeartrack" style={{ width: innerWidth }}>
            {years.map((y) => (
              <span key={y} className="tl__year" style={{ width: px }}>
                {y}
              </span>
            ))}
          </div>
        </div>

        <div
          className="tl__now"
          style={{ left: (prefs.stickyLabels ? 96 : 0) + (nowFrac - min) * px }}
          aria-hidden
        >
          <span className="tl__nowpill">now</span>
        </div>

        {(brushLeft != null && brushWidth != null) && (
          <div
            className="tl__brush"
            style={{
              left: (prefs.stickyLabels ? 96 : 0) + brushLeft,
              width: brushWidth,
            }}
            aria-hidden
          />
        )}

        <div className="tl__lanes">
          {visibleLanes.map((lane) => {
            const items = lane.items.filter((i) => prefs.showMoments || i.kind === 'span');
            const rows = stackRows(items, endOf);
            const rowCount = items.length === 0 ? 1 : Math.max(1, ...rows.values()) + 1;
            return (
              <div key={lane.name} className="tl__lane">
                <span className={`tl__lanename${prefs.stickyLabels ? ' tl__lanename--sticky' : ''}`}>
                  {lane.name}
                </span>
                <div className="tl__track" style={{ height: rowCount * rowH, width: innerWidth }}>
                  {items.map((item) => {
                    const start = yearFrac(item.start);
                    const end = endOf(item);
                    const left = (start - min) * px;
                    const tone = barTone(item, palette);
                    const row = rows.get(item.id) ?? 0;
                    const top = 4 + row * rowH;
                    const selected = selectedId === item.id;
                    const label = prefs.showSubtitles && item.subtitle
                      ? `${item.title} · ${item.subtitle}`
                      : item.title;
                    const fullLabel = itemLabel(item);

                    if (item.kind === 'moment') {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`tl__moment${selected ? ' tl__moment--on' : ''}`}
                          aria-label={fullLabel}
                          aria-pressed={selected}
                          style={{
                            left: left - 6,
                            top,
                            borderColor: tone.border,
                            background: tone.bg,
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onSelect(item);
                          }}
                          onDoubleClick={(ev) => {
                            ev.stopPropagation();
                            onOpen(item);
                          }}
                        >
                          <span className="tl__momentlabel" style={{ color: tone.fg }}>
                            {item.title}
                          </span>
                        </button>
                      );
                    }

                    const width = Math.max((end - start) * px, 28);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`tl__bar${item.current ? ' tl__bar--current' : ''}${selected ? ' tl__bar--on' : ''}`}
                        aria-label={fullLabel}
                        aria-pressed={selected}
                        style={{
                          left,
                          width,
                          top,
                          height: rowH - 8,
                          background: tone.bg,
                          borderColor: tone.border,
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelect(item);
                        }}
                        onDoubleClick={(ev) => {
                          ev.stopPropagation();
                          onOpen(item);
                        }}
                      >
                        <span style={{ color: tone.fg }}>{label}</span>
                        {/* Still going was signalled by a tint and a ring and
                            nothing else. Never colour alone. */}
                        {item.current && <span className="u-mono text-xs text-muted"> → now</span>}
                        {/* Still going was signalled by a tint and a ring and
                            nothing else. Never colour alone. */}

                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fracToIsoClamped(frac: number, years: number[]): string {
  const minY = years[0] ?? Math.floor(frac);
  const maxY = years[years.length - 1] ?? Math.ceil(frac);
  const y = Math.min(maxY, Math.max(minY, Math.floor(frac)));
  const rem = Math.min(0.999, Math.max(0, frac - Math.floor(frac)));
  const monthFloat = rem * 12;
  const m = Math.min(11, Math.floor(monthFloat));
  const d = Math.min(28, Math.max(1, Math.floor((monthFloat - m) * 28) + 1));
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
