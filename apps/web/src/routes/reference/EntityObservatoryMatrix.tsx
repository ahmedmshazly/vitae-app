import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { Button, Mono } from '@vitae/ui';
import {
  OBSERVATORY_GROUP_SLOTS,
  buildObservatoryMatrix,
  type ObservatoryMatrixCell,
  type ObservatorySelectionId,
  type ObservatoryWorkspaceState,
} from './entityObservatoryModel.js';

/**
 * Group fill as a token reference rather than a literal. The canvas needs real
 * colour strings because it paints to a bitmap; this is DOM, so it can name the
 * variable and follow the theme.
 */
function groupColor(group: string): string {
  if (group === 'Universal') return 'var(--ae-fg-strong)';
  const slot = OBSERVATORY_GROUP_SLOTS[group as keyof typeof OBSERVATORY_GROUP_SLOTS];
  return slot ? `var(--ae-viz-${slot})` : 'var(--ae-muted)';
}

function cellKey(sourceId: string, targetId: string): string {
  return `${sourceId}|${targetId}`;
}

/** Where focus sits in the grid. Row 0 is the header row, column 0 the header
 * column, so the corner is (0, 0) and the first data cell is (1, 1). */
interface Spot {
  r: number;
  c: number;
}

export function EntityObservatoryMatrix({
  state,
  onSelect,
}: {
  state: ObservatoryWorkspaceState;
  onSelect: (id: ObservatorySelectionId, compare: boolean) => void;
}) {
  const ids = useId();
  const matrix = useMemo(() => buildObservatoryMatrix(state), [state]);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  // Read through the live matrix rather than caching the cell, so a filter or
  // sort that removes the cell closes the panel instead of leaving relations on
  // screen for a cell that is no longer there.
  const activeCell = activeCellKey ? (matrix.cells.get(activeCellKey) ?? null) : null;
  const selected = new Set([...state.selectedIds, ...state.compareIds]);
  const entities = matrix.entities;
  // Transposing swaps which axis carries the source, which the two lookups
  // below already do. It used to also reverse the column order, which scrambled
  // the reading order for no reason and broke the diagonal.
  const columns = entities;
  const rows = entities;
  const rowAxis = state.display.transpose ? 'target' : 'source';
  const columnAxis = state.display.transpose ? 'source' : 'target';

  const gridRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  // 1156 cells would otherwise be 1156 tab stops. One cell holds the tab stop
  // and the arrow keys move it, which is how a grid is meant to be walked.
  const [spot, setSpot] = useState<Spot>({ r: 1, c: 1 });

  function matrixCell(rowId: ObservatorySelectionId, columnId: ObservatorySelectionId) {
    return state.display.transpose
      ? matrix.cells.get(cellKey(columnId, rowId))
      : matrix.cells.get(cellKey(rowId, columnId));
  }

  function describeCell(
    rowLabel: string,
    columnLabel: string,
    cell: ObservatoryMatrixCell | undefined,
  ): string {
    const source = state.display.transpose ? columnLabel : rowLabel;
    const target = state.display.transpose ? rowLabel : columnLabel;
    if (!cell) return `${source} to ${target}, no canonical relation`;
    const names = cell.relations.map((relation) => relation.type).join(', ');
    return `${source} to ${target}, ${cell.relations.length} relation${cell.relations.length === 1 ? '' : 's'}: ${names}`;
  }

  const focusSpot = useCallback((next: Spot) => {
    setSpot(next);
    const grid = gridRef.current;
    const target = grid?.querySelector<HTMLElement>(`[data-r="${next.r}"][data-c="${next.c}"]`);
    target?.focus();
  }, []);

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Modified keys belong to the browser and to the app's own shortcuts.
    if (event.altKey || event.metaKey) return;
    const lastRow = rows.length;
    const lastColumn = columns.length;
    const clamp = (r: number, c: number): Spot => ({
      r: Math.min(Math.max(r, 0), lastRow),
      c: Math.min(Math.max(c, 0), lastColumn),
    });
    let next: Spot | null = null;
    switch (event.key) {
      case 'ArrowUp':
        next = clamp(spot.r - 1, spot.c);
        break;
      case 'ArrowDown':
        next = clamp(spot.r + 1, spot.c);
        break;
      case 'ArrowLeft':
        next = clamp(spot.r, spot.c - 1);
        break;
      case 'ArrowRight':
        next = clamp(spot.r, spot.c + 1);
        break;
      case 'PageUp':
        next = clamp(spot.r - 10, spot.c);
        break;
      case 'PageDown':
        next = clamp(spot.r + 10, spot.c);
        break;
      case 'Home':
        next = event.ctrlKey ? clamp(0, 0) : clamp(spot.r, 0);
        break;
      case 'End':
        next = event.ctrlKey ? clamp(lastRow, lastColumn) : clamp(spot.r, lastColumn);
        break;
      case 'Escape':
        if (activeCellKey) {
          setActiveCellKey(null);
          focusSpot(spot);
          event.preventDefault();
        }
        return;
      default:
        return;
    }
    if (event.ctrlKey && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    focusSpot(next);
  }

  // The detail is a panel, not an overlay, so nothing moves focus into it for
  // us. Opening a cell has to hand focus over or the keyboard user never
  // reaches the relations they just asked to see.
  useEffect(() => {
    if (activeCellKey) detailRef.current?.focus();
  }, [activeCellKey]);

  function closeDetail() {
    setActiveCellKey(null);
    focusSpot(spot);
  }

  return (
    <section className="ec-matrix-lens" data-transposed={state.display.transpose} aria-labelledby={`${ids}-title`}>
      <div className="ec-matrix-lens__intro">
        <div>
          <span>
            {rowAxis} ↓ · {columnAxis} →
          </span>
          <h2 id={`${ids}-title`}>{matrix.relationCount} exact endpoint mappings</h2>
        </div>
        <p>
          A line-free audit surface. Select a header to focus an entity, or a populated cell to read
          its exact relation vocabulary. Arrow keys walk the grid, Escape closes a cell.
        </p>
      </div>

      <div
        className="ec-matrix-scroll"
        role="region"
        aria-label="Relation matrix, scrollable"
        tabIndex={0}
      >
        <div
          ref={gridRef}
          className="ec-matrix-grid"
          style={{
            gridTemplateColumns: `var(--ec-matrix-head) repeat(${columns.length}, var(--ae-hit-target))`,
            gridTemplateRows: `var(--ec-matrix-head) repeat(${rows.length}, var(--ae-hit-target))`,
          }}
          role="grid"
          aria-labelledby={`${ids}-title`}
          aria-rowcount={rows.length + 1}
          aria-colcount={columns.length + 1}
          onKeyDown={onGridKeyDown}
        >
          <div className="ec-matrix-grid__rowgroup" role="row" aria-rowindex={1}>
            <div
              className="ec-matrix-grid__corner"
              role="columnheader"
              aria-colindex={1}
              data-r={0}
              data-c={0}
              tabIndex={spot.r === 0 && spot.c === 0 ? 0 : -1}
              onFocus={() => setSpot({ r: 0, c: 0 })}
            >
              <span>{columnAxis}</span>
              <b>{rowAxis}</b>
            </div>
            {columns.map((entity, index) => (
              <button
                key={`column:${entity.id}`}
                type="button"
                role="columnheader"
                aria-colindex={index + 2}
                data-r={0}
                data-c={index + 1}
                data-group={entity.group}
                tabIndex={spot.r === 0 && spot.c === index + 1 ? 0 : -1}
                onFocus={() => setSpot({ r: 0, c: index + 1 })}
                className={`ec-matrix-grid__column${selected.has(entity.id) ? ' is-selected' : ''}`}
                style={{ '--matrix-group': groupColor(entity.group) } as CSSProperties}
                aria-label={`${entity.label}, ${entity.group} group, ${entity.degree} relation endpoints`}
                title={`${entity.label} · ${entity.group} · ${entity.degree} relation endpoints`}
                onClick={(event) => onSelect(entity.id, event.shiftKey)}
              >
                <span aria-hidden>{entity.label}</span>
              </button>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div
              key={`row:${row.id}`}
              className="ec-matrix-grid__rowgroup"
              role="row"
              aria-rowindex={rowIndex + 2}
            >
              <button
                type="button"
                role="rowheader"
                aria-colindex={1}
                data-r={rowIndex + 1}
                data-c={0}
                data-group={row.group}
                tabIndex={spot.r === rowIndex + 1 && spot.c === 0 ? 0 : -1}
                onFocus={() => setSpot({ r: rowIndex + 1, c: 0 })}
                className={`ec-matrix-grid__row${selected.has(row.id) ? ' is-selected' : ''}`}
                style={{ '--matrix-group': groupColor(row.group) } as CSSProperties}
                aria-label={`${row.label}, ${row.group} group, ${row.degree} relation endpoints`}
                title={`${row.label} · ${row.group} · ${row.degree} relation endpoints`}
                onClick={(event) => onSelect(row.id, event.shiftKey)}
              >
                <span aria-hidden>{row.label}</span>
                <small aria-hidden>{row.degree}</small>
              </button>
              {columns.map((column, columnIndex) => {
                const cell = matrixCell(row.id, column.id);
                const key = cellKey(
                  state.display.transpose ? column.id : row.id,
                  state.display.transpose ? row.id : column.id,
                );
                const count = cell?.relations.length ?? 0;
                return (
                  <button
                    key={`cell:${row.id}:${column.id}`}
                    type="button"
                    role="gridcell"
                    aria-colindex={columnIndex + 2}
                    data-r={rowIndex + 1}
                    data-c={columnIndex + 1}
                    tabIndex={spot.r === rowIndex + 1 && spot.c === columnIndex + 1 ? 0 : -1}
                    onFocus={() => setSpot({ r: rowIndex + 1, c: columnIndex + 1 })}
                    aria-label={describeCell(row.label, column.label, cell)}
                    aria-expanded={cell ? activeCellKey === key : undefined}
                    aria-haspopup={cell ? 'dialog' : undefined}
                    className={`ec-matrix-grid__cell${count ? ' has-relations' : ''}`}
                    data-count={count}
                    data-open={activeCellKey === key}
                    data-source-selected={selected.has(row.id)}
                    data-target-selected={selected.has(column.id)}
                    // Not `disabled`: a disabled button cannot take focus, so
                    // every empty cell would be a hole the arrow keys fall
                    // through and the grid would stop being walkable.
                    aria-disabled={cell ? undefined : true}
                    title={cell?.relations.map((relation) => relation.type).join(', ')}
                    onClick={() => cell && setActiveCellKey(key)}
                  >
                    {cell ? <span aria-hidden>{count}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Docked rather than floating: an overlay anchored to a 32px cell either
          covers the neighbours the reader is comparing it against or lands off
          screen at the edges of a 34-column grid. */}
      {activeCell ? (
        <div
          className="ec-matrix-detail"
          role="dialog"
          aria-label={`Relations from ${activeCell.sourceId.replace('entity:', '')} to ${activeCell.targetId.replace('entity:', '')}`}
          tabIndex={-1}
          ref={detailRef}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeDetail();
            }
          }}
        >
          <div className="ec-matrix-detail__head">
            <Mono>{activeCell.sourceId.replace('entity:', '')}</Mono>
            <b aria-hidden>→</b>
            <Mono>{activeCell.targetId.replace('entity:', '')}</Mono>
            <Button size="sm" variant="ghost" onClick={closeDetail}>
              Close
            </Button>
          </div>
          <ul className="ec-matrix-detail__list">
            {activeCell.relations.map((relation) => (
              <li key={relation.id}>
                <button type="button" onClick={(event) => onSelect(relation.id, event.shiftKey)}>
                  <code>{relation.type}</code>
                  <small>{relation.label}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
