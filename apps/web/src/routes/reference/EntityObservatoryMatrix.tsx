import { useMemo, useState, type CSSProperties } from 'react';
import {
  OBSERVATORY_GROUP_COLORS,
  buildObservatoryMatrix,
  type ObservatoryMatrixCell,
  type ObservatorySelectionId,
  type ObservatoryWorkspaceState,
} from './entityObservatoryModel.js';

function groupColor(group: string): string {
  if (group === 'Universal') return '#fafaf8';
  return (
    OBSERVATORY_GROUP_COLORS[group as keyof typeof OBSERVATORY_GROUP_COLORS] ?? '#a3a3a0'
  );
}

function cellKey(sourceId: string, targetId: string): string {
  return `${sourceId}|${targetId}`;
}

export function EntityObservatoryMatrix({
  state,
  onSelect,
}: {
  state: ObservatoryWorkspaceState;
  onSelect: (id: ObservatorySelectionId, compare: boolean) => void;
}) {
  const matrix = useMemo(() => buildObservatoryMatrix(state), [state]);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const activeCell = activeCellKey ? matrix.cells.get(activeCellKey) ?? null : null;
  const selected = new Set([...state.selectedIds, ...state.compareIds]);
  const entities = matrix.entities;
  const columns = state.display.transpose ? [...entities].reverse() : entities;
  const rows = entities;

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
    if (!cell) return `${source} to ${target}: no canonical relation`;
    return `${source} to ${target}: ${cell.relations.map((relation) => relation.type).join(', ')}`;
  }

  return (
    <div className="ec-matrix-lens" data-transposed={state.display.transpose}>
      <div className="ec-matrix-lens__intro">
        <div>
          <span>Source ↓ · target →</span>
          <strong>{matrix.relationCount} exact endpoint mappings</strong>
        </div>
        <p>
          A line-free audit surface. Select a header to focus an entity or a populated cell to
          inspect its exact relation vocabulary.
        </p>
      </div>

      {activeCell ? (
        <div className="ec-matrix-popover" role="dialog" aria-label="Matrix cell relations">
          <div>
            <span>{activeCell.sourceId.replace('entity:', '')}</span>
            <b>→</b>
            <span>{activeCell.targetId.replace('entity:', '')}</span>
          </div>
          <div>
            {activeCell.relations.map((relation) => (
              <button
                key={relation.id}
                type="button"
                onClick={(event) => onSelect(relation.id, event.shiftKey)}
              >
                <code>{relation.type}</code>
                <small>{relation.label}</small>
              </button>
            ))}
          </div>
          <button
            className="ec-matrix-popover__close"
            type="button"
            aria-label="Close matrix cell"
            onClick={() => setActiveCellKey(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="ec-matrix-scroll" tabIndex={0} aria-label="Scrollable relation matrix">
        <div
          className="ec-matrix-grid"
          style={{
            gridTemplateColumns: `108px repeat(${columns.length}, 28px)`,
            gridTemplateRows: `108px repeat(${rows.length}, 28px)`,
          }}
          role="grid"
          aria-rowcount={rows.length + 1}
          aria-colcount={columns.length + 1}
        >
          <div className="ec-matrix-grid__corner" role="columnheader">
            <span>target</span>
            <b>source</b>
          </div>
          {columns.map((entity) => (
            <button
              key={`column:${entity.id}`}
              type="button"
              role="columnheader"
              className={`ec-matrix-grid__column${selected.has(entity.id) ? ' is-selected' : ''}`}
              style={{ '--matrix-group': groupColor(entity.group) } as CSSProperties}
              title={`${entity.label} · ${entity.degree} relation endpoints`}
              onClick={(event) => onSelect(entity.id, event.shiftKey)}
            >
              <span>{entity.label}</span>
            </button>
          ))}
          {rows.flatMap((row) => [
            <button
              key={`row:${row.id}`}
              type="button"
              role="rowheader"
              className={`ec-matrix-grid__row${selected.has(row.id) ? ' is-selected' : ''}`}
              style={{ '--matrix-group': groupColor(row.group) } as CSSProperties}
              onClick={(event) => onSelect(row.id, event.shiftKey)}
            >
              <span>{row.label}</span>
              <small>{row.degree}</small>
            </button>,
            ...columns.map((column) => {
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
                  aria-label={describeCell(row.label, column.label, cell)}
                  aria-selected={activeCellKey === key}
                  className={`ec-matrix-grid__cell${count ? ' has-relations' : ''}`}
                  data-count={count}
                  data-source-selected={selected.has(row.id)}
                  data-target-selected={selected.has(column.id)}
                  disabled={!cell}
                  title={cell?.relations.map((relation) => relation.type).join(', ')}
                  onClick={() => setActiveCellKey(key)}
                >
                  {cell ? (
                    <>
                      <span>{count}</span>
                      <i aria-hidden />
                    </>
                  ) : null}
                </button>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}
