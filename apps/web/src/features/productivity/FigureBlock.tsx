import { Section } from '@vitae/ui';

export interface FigureRow {
  readonly key: string;
  readonly cells: readonly string[];
  readonly value: number;
}

export interface FigureBlockProps {
  title: string;
  columns: readonly string[];
  rows: readonly FigureRow[];
}

export function FigureBlock({ title, columns, rows }: FigureBlockProps) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Section title={title}>
      <div className="prod-figure">
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
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, index) =>
                  index === 0 ? (
                    <th key={`${row.key}-${index}`} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={`${row.key}-${index}`}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="prod-chart" aria-label={`${title} chart`}>
          {rows.map((row) => (
            <li key={row.key} className="prod-chart__row">
              <span className="prod-chart__label">{row.cells[0]}</span>
              <span className="prod-chart__track">
                <span
                  className="prod-chart__bar"
                  style={{ width: `${Math.round((row.value / max) * 100)}%` }}
                  aria-hidden
                />
              </span>
              <span className="prod-chart__n">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
