/**
 * Diagrams, drawn from data rather than from a picture.
 *
 * Every diagram in the corpus is declared in `docs/registry/diagrams` and
 * folded into the page at build time, so what is drawn here and what a gate
 * checks against the source are the same fields. There is no image to fall out
 * of date with the code, and no separate alternative text to fall out of date
 * with the image.
 *
 * The accessible equivalent is not an afterthought or a second page. The table
 * is always in the document (visually hidden until a reader asks for it, and
 * always read by assistive technology), while the drawing is marked
 * `aria-hidden`, because it is a second presentation of the table and not a
 * second set of facts. That is the only arrangement in which the two cannot
 * disagree.
 *
 * Nothing here lays out a graph. A general layout engine would be a dependency
 * and a source of arbitrary results; instead each shape has a layout its own
 * data determines. A sequence is columns and rows. A state machine is a matrix
 * of what leads to what. A topology is grouped by trust zone, which is the
 * thing a reader is looking at it to understand. Lanes are a grid. Every one is
 * deterministic: the same specification draws the same diagram.
 */
import { useId, useState } from 'react';
import {
  type DocsDiagramSpec,
  type DocsDiagramStep,
  DOCS_STEP_KIND,
  DOCS_TRUST,
  docsStatePosition,
} from './docsModel.js';

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

const COLUMN = 168;
const HEADER = 46;
const ROW = 44;
const PADDING = 16;

/** Which way an arrow points, and how it is drawn. */
function arrowOf(step: DocsDiagramStep) {
  const kind = step.kind ?? 'call';
  return {
    dashed: kind === 'return' || kind === 'aside',
    // A refusal is the one arrow that means "and then nothing further", so it
    // is the one that gets a distinct terminal marker rather than a colour.
    refused: kind === 'refusal',
  };
}

function SequenceDrawing({ spec }: { spec: DocsDiagramSpec }) {
  const actors = spec.actors ?? [];
  const steps = spec.steps ?? [];
  const index = new Map(actors.map((actor, position) => [actor.id, position]));
  const width = PADDING * 2 + Math.max(1, actors.length) * COLUMN;
  const height = HEADER + steps.length * ROW + PADDING * 2;
  const centre = (id: string) => PADDING + (index.get(id) ?? 0) * COLUMN + COLUMN / 2;

  return (
    <svg
      className="docs-diagram__svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <marker id="docs-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>
      {actors.map((actor) => {
        const x = centre(actor.id);
        return (
          <g key={actor.id}>
            <rect
              className="docs-diagram__actor"
              x={x - COLUMN / 2 + 8}
              y={PADDING}
              width={COLUMN - 16}
              height={26}
              rx={3}
            />
            <text className="docs-diagram__actor-text" x={x} y={PADDING + 18} textAnchor="middle">
              {actor.label}
            </text>
            <line
              className="docs-diagram__lifeline"
              x1={x}
              y1={PADDING + 30}
              x2={x}
              y2={height - PADDING}
            />
          </g>
        );
      })}
      {steps.map((step, position) => {
        const y = HEADER + position * ROW + ROW / 2;
        const from = centre(step.from);
        const to = centre(step.to);
        const { dashed, refused } = arrowOf(step);
        const self = step.from === step.to;
        return (
          <g key={`${step.from}-${step.to}-${position}`} className="docs-diagram__step">
            {self ? (
              <path
                className={`docs-diagram__arrow${dashed ? ' docs-diagram__arrow--dashed' : ''}`}
                d={`M${from},${y - 8} h34 v16 h-34`}
                markerEnd="url(#docs-arrow)"
                fill="none"
              />
            ) : (
              <line
                className={`docs-diagram__arrow${dashed ? ' docs-diagram__arrow--dashed' : ''}`}
                x1={from}
                y1={y}
                x2={to}
                y2={y}
                markerEnd="url(#docs-arrow)"
              />
            )}
            {refused && (
              <g className="docs-diagram__refusal">
                <line x1={to - 7} y1={y - 7} x2={to + 7} y2={y + 7} />
                <line x1={to - 7} y1={y + 7} x2={to + 7} y2={y - 7} />
              </g>
            )}
            <text
              className="docs-diagram__label"
              x={self ? from + 42 : (from + to) / 2}
              y={y - 8}
              textAnchor={self ? 'start' : 'middle'}
            >
              {`${position + 1}. ${step.label}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * A state machine as what-leads-to-what.
 *
 * Drawn as a matrix rather than as a node graph, because a graph of six states
 * needs a layout algorithm to look like anything and the algorithm's output is
 * arbitrary. The matrix is deterministic, shows at a glance which states are
 * dead ends and which are reachable from everywhere, and is already the shape
 * its own accessible equivalent needs.
 */
function StateDrawing({ spec }: { spec: DocsDiagramSpec }) {
  const states = spec.states ?? [];
  const transitions = spec.transitions ?? [];
  const label = (id: string) => states.find((state) => state.id === id)?.label ?? id;
  const at = (from: string, to: string) =>
    transitions.filter((move) => move.from === from && move.to === to);

  return (
    <div className="docs-diagram__matrix" aria-hidden="true">
      <table>
        <thead>
          <tr>
            <td />
            {states.map((state) => (
              <th key={state.id} scope="col">
                {state.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {states.map((from) => (
            <tr key={from.id}>
              <th scope="row">
                <span className="docs-diagram__state-name">{from.label}</span>
                {from.initial && <span className="docs-diagram__state-mark">starts</span>}
                {from.terminal && <span className="docs-diagram__state-mark">ends</span>}
                {from.unreachable && (
                  <span className="docs-diagram__state-mark">nothing reaches this</span>
                )}
              </th>
              {states.map((to) => {
                const moves = at(from.id, to.id);
                return (
                  <td key={to.id} data-filled={moves.length > 0 ? 'yes' : 'no'}>
                    {moves.map((move) => (
                      <span key={move.label} className="docs-diagram__move">
                        {move.label}
                      </span>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="docs-diagram__legend">
        A row is the state something is in; a column is the state it moves to. A filled cell names
        what causes the move. {label(states.find((s) => s.initial)?.id ?? '')} is where it starts.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

function TopologyDrawing({ spec }: { spec: DocsDiagramSpec }) {
  const zones = spec.zones ?? [];
  const nodes = spec.nodes ?? [];
  const links = spec.links ?? [];
  const name = (id: string) => nodes.find((node) => node.id === id)?.label ?? id;
  const zoneOf = (id: string) => nodes.find((node) => node.id === id)?.zone;

  return (
    <div className="docs-diagram__topology" aria-hidden="true">
      {zones.map((zone) => (
        <section className="docs-diagram__zone" key={zone.id} data-trust={zone.trust}>
          <p className="docs-diagram__zone-title">
            {zone.label} <span className="docs-diagram__zone-trust">{DOCS_TRUST[zone.trust]}</span>
          </p>
          <ul className="docs-diagram__nodes">
            {nodes
              .filter((node) => node.zone === zone.id)
              .map((node) => (
                <li key={node.id}>{node.label}</li>
              ))}
          </ul>
        </section>
      ))}
      <p className="docs-diagram__legend">What crosses between them</p>
      <ul className="docs-diagram__links">
        {links.map((link, position) => (
          <li key={`${link.from}-${link.to}-${position}`}>
            <span className="docs-diagram__link-ends">
              {name(link.from)} → {name(link.to)}
            </span>
            <span className="docs-diagram__link-label">{link.label}</span>
            {zoneOf(link.from) !== zoneOf(link.to) && (
              <span className="docs-diagram__link-crossing">crosses a boundary</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

function LanesDrawing({ spec }: { spec: DocsDiagramSpec }) {
  const lanes = spec.lanes ?? [];
  const phases = spec.phases ?? [];
  return (
    <div className="docs-diagram__lanes" aria-hidden="true">
      <div
        className="docs-diagram__grid"
        style={{ gridTemplateColumns: `minmax(7rem, auto) repeat(${Math.max(1, phases.length)}, minmax(9rem, 1fr))` }}
      >
        <span className="docs-diagram__corner" />
        {phases.map((phase, position) => (
          <span className="docs-diagram__phase-head" key={phase.id}>
            {position + 1}
          </span>
        ))}
        {lanes.map((lane) => (
          <div className="docs-diagram__lane-row" key={lane.id} style={{ display: 'contents' }}>
            <span className="docs-diagram__lane-name">{lane.label}</span>
            {phases.map((phase) => (
              <span
                className="docs-diagram__cell"
                key={phase.id}
                data-here={phase.lane === lane.id ? 'yes' : 'no'}
              >
                {phase.lane === lane.id && (
                  <>
                    <span className="docs-diagram__phase">{phase.label}</span>
                    <span className="docs-diagram__covered">
                      {phase.covered_by && phase.covered_by.length > 0
                        ? `${phase.covered_by.length} test${phase.covered_by.length === 1 ? '' : 's'}`
                        : 'no test'}
                    </span>
                  </>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tables, which are the diagram in words
// ---------------------------------------------------------------------------

function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly React.ReactNode[])[];
}) {
  if (rows.length === 0) return null;
  return (
    <table className="docs-table docs-diagram__table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, position) => (
          <tr key={position}>
            {row.map((cell, column) =>
              column === 0 ? (
                <th key={column} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={column}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DiagramTables({ spec }: { spec: DocsDiagramSpec }) {
  const label = (list: readonly { id: string; label: string }[] | undefined, id: string) =>
    list?.find((item) => item.id === id)?.label ?? id;

  if (spec.kind === 'sequence') {
    return (
      <Table
        caption="Steps in order"
        head={['Step', 'From', 'To', 'What happens', 'Where']}
        rows={(spec.steps ?? []).map((step, position) => [
          position + 1,
          label(spec.actors, step.from),
          label(spec.actors, step.to),
          <>
            {DOCS_STEP_KIND[step.kind ?? 'call']}: {step.label}
            {step.note ? ` ${step.note}` : ''}
          </>,
          step.source ? <code className="docs-mono">{step.source}</code> : '—',
        ])}
      />
    );
  }
  if (spec.kind === 'state') {
    return (
      <>
        <Table
          caption="States"
          head={['State', 'Meaning', 'Position']}
          rows={(spec.states ?? []).map((state) => [
            state.label,
            state.note ?? '—',
            docsStatePosition(state),
          ])}
        />
        <Table
          caption="Transitions"
          head={['From', 'To', 'What causes it', 'Where']}
          rows={(spec.transitions ?? []).map((move) => [
            label(spec.states, move.from),
            label(spec.states, move.to),
            <>
              {move.label}
              {move.note ? ` ${move.note}` : ''}
            </>,
            move.source ? <code className="docs-mono">{move.source}</code> : '—',
          ])}
        />
      </>
    );
  }
  if (spec.kind === 'topology') {
    return (
      <>
        <Table
          caption="Trust zones"
          head={['Zone', 'Trust', 'Note']}
          rows={(spec.zones ?? []).map((zone) => [zone.label, DOCS_TRUST[zone.trust], zone.note ?? '—'])}
        />
        <Table
          caption="Components"
          head={['Component', 'Zone', 'Note', 'Where']}
          rows={(spec.nodes ?? []).map((node) => [
            node.label,
            label(spec.zones, node.zone),
            node.note ?? '—',
            node.source ? <code className="docs-mono">{node.source}</code> : '—',
          ])}
        />
        <Table
          caption="What crosses between them"
          head={['From', 'To', 'What moves', 'Carrying']}
          rows={(spec.links ?? []).map((link) => [
            label(spec.nodes, link.from),
            label(spec.nodes, link.to),
            link.label,
            link.carries ?? '—',
          ])}
        />
      </>
    );
  }
  return (
    <Table
      caption="Phases in order"
      head={['Phase', 'Where it happens', 'What the person does', 'Route', 'Covered by']}
      rows={(spec.phases ?? []).map((phase) => [
        phase.label,
        label(spec.lanes, phase.lane),
        phase.note ?? '—',
        phase.route ? <code className="docs-mono">{phase.route}</code> : '—',
        phase.covered_by && phase.covered_by.length > 0 ? (
          phase.covered_by.map((file) => (
            <code className="docs-mono" key={file}>
              {file}
            </code>
          ))
        ) : (
          <>Nothing runs this phase</>
        ),
      ])}
    />
  );
}

function Drawing({ spec }: { spec: DocsDiagramSpec }) {
  if (spec.kind === 'sequence') return <SequenceDrawing spec={spec} />;
  if (spec.kind === 'state') return <StateDrawing spec={spec} />;
  if (spec.kind === 'topology') return <TopologyDrawing spec={spec} />;
  return <LanesDrawing spec={spec} />;
}

export function DocsDiagram({ spec }: { spec: DocsDiagramSpec }) {
  const [shown, setShown] = useState(false);
  const tablesId = useId();

  return (
    <figure className="docs-diagram" data-kind={spec.kind}>
      <figcaption className="docs-diagram__caption">
        <span className="docs-diagram__title">{spec.title}</span>
        <span className="docs-diagram__summary">{spec.summary}</span>
      </figcaption>

      {/* A wide diagram scrolls inside this box, and a box that scrolls has to
          be reachable by keyboard or its right-hand side is unreachable
          without a mouse (WCAG 2.1.1, and the reason Safari needs it). It is
          named rather than left as a bare focus stop, and the name says where
          the same content is in text, because the drawing itself is hidden
          from assistive technology as a duplicate of the table. */}
      <div
        className="docs-diagram__frame"
        role="group"
        aria-label={`${spec.title}, drawn. The same information is in the table below.`}
        tabIndex={0}
      >
        <Drawing spec={spec} />
      </div>

      {spec.note && <p className="docs-diagram__note">{spec.note}</p>}

      <div className="docs-diagram__controls">
        <button
          className="docs-diagram__toggle"
          type="button"
          aria-expanded={shown}
          aria-controls={tablesId}
          onClick={() => setShown((current) => !current)}
        >
          {shown ? 'Hide the table' : 'Show as a table'}
        </button>
        <span className="docs-diagram__read-from">
          Read from{' '}
          {spec.sources.map((path, position) => (
            <span key={path}>
              {position > 0 && ', '}
              <code className="docs-mono">{path}</code>
            </span>
          ))}
        </span>
      </div>

      {/* Always in the document, so a screen reader gets the whole diagram
          whether or not anyone pressed the button. Hidden only visually. */}
      <div className={shown ? 'docs-diagram__tables' : 'docs-diagram__tables u-visually-hidden'} id={tablesId}>
        <DiagramTables spec={spec} />
      </div>
    </figure>
  );
}
