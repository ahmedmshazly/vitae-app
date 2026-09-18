import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@vitae/ui';

export interface FigureRow {
  readonly key: string;
  readonly cells: readonly string[];
  readonly value: number;
  readonly href?: string;
  readonly valueLabel?: string;
}

export interface FigureBlockProps {
  title: string;
  columns: readonly string[];
  rows: readonly FigureRow[];
  description?: string;
  emptyHint?: string;
  chartLabel?: string;
}

export function FigureBlock({
  title,
  columns,
  rows,
  description,
  emptyHint = 'No records for this figure yet.',
  chartLabel = 'Count',
}: FigureBlockProps) {
  const id = useId();
  const [limit, setLimit] = useState(20);
  const visible = rows.slice(0, limit);
  const max = rows.reduce(
    (largest, row) => (Number.isFinite(row.value) ? Math.max(largest, row.value) : largest),
    1,
  );
  return (
    <section className="prod-analytics-figure" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {description && <p className="prod-muted">{description}</p>}
      {rows.length === 0 ? (
        <p className="prod-figure-empty">{emptyHint}</p>
      ) : (
        <>
          <div
            className="prod-analytics-table"
            role="region"
            aria-label={`${title} data`}
            tabIndex={0}
          >
            <table className="prod-table">
              <caption className="u-visually-hidden">{title}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.key}>
                    {row.cells.map((cell, index) =>
                      index === 0 ? (
                        <th key={`${row.key}-${index}`} scope="row">
                          {row.href ? <Link to={row.href}>{cell}</Link> : cell}
                        </th>
                      ) : (
                        <td key={`${row.key}-${index}`}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="prod-analytics-comparison">
            <summary>Compare {title.toLowerCase()}</summary>
            <p className="prod-muted">
              {chartLabel}. Bars share a scale across {rows.length}{' '}
              {rows.length === 1 ? 'row' : 'rows'}.
            </p>
            <ul className="prod-chart" aria-label={`${title} chart`}>
              {visible.map((row) => (
                <li key={row.key} className="prod-chart__row">
                  <span className="prod-chart__label">{row.cells[0]}</span>
                  <span className="prod-chart__track">
                    <span
                      className="prod-chart__bar"
                      style={{
                        width: `${Number.isFinite(row.value) ? Math.max(0, Math.round((row.value / max) * 100)) : 0}%`,
                      }}
                      aria-hidden
                    />
                  </span>
                  <span className="prod-chart__n">{row.valueLabel ?? row.value}</span>
                </li>
              ))}
            </ul>
          </details>
          {rows.length > 20 && (
            <div className="prod-analytics-more">
              <span className="prod-muted">
                Showing {visible.length} of {rows.length} rows
              </span>
              {rows.length > limit && (
                <Button onClick={() => setLimit((value) => value + 20)}>
                  Show more {title.toLowerCase()}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
