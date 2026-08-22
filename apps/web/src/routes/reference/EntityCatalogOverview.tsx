import { useId, type Ref } from 'react';
import {
  CATALOG_COUNTS,
  CATALOG_GRAPH,
  ENTITY_GROUPS,
  type CatalogGraphNode,
  type CatalogGroup,
} from './entityCatalogModel.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 1000;
const OFFSET_X = VIEW_WIDTH / 2;
const OFFSET_Y = VIEW_HEIGHT / 2;

/**
 * An exported SVG travels without the app's stylesheet, so every colour the
 * screen resolves through a custom property has to be written out literally
 * here. Each entry names the token it mirrors, and the colocated test reads
 * packages/ui/src/styles/tokens.css and fails when one drifts: three of these
 * had already drifted, so the exported "canonical" map was not the map anyone
 * saw on screen.
 */
export const OVERVIEW_INK = {
  '--ae-bg': '#0f0f0f',
  '--ae-surface': '#151515',
  '--ae-surface-raised': '#1c1c1c',
  '--ae-accent-bg': '#262626',
  '--ae-border-strong': '#3f3f3f',
  '--ae-border-control': '#727271',
  '--ae-fg': '#e8e8e6',
  '--ae-fg-soft': '#c9c9c6',
  '--ae-fg-strong': '#fafaf8',
} as const;

/**
 * The wildcard hatch is filled from a presentation attribute on the node
 * rather than from a rule here, because its pattern id is per-instance (see
 * `idPrefix`) and a stylesheet cannot name an id it does not know.
 */
export const OVERVIEW_SVG_EXPORT_STYLE = `
  .ec-overview__backdrop{fill:${OVERVIEW_INK['--ae-bg']};stroke:${OVERVIEW_INK['--ae-border-strong']};stroke-width:2}
  .ec-overview__group rect{fill:${OVERVIEW_INK['--ae-surface-raised']};stroke:${OVERVIEW_INK['--ae-border-strong']};stroke-width:2}
  .ec-overview__group>text,.ec-overview__relation-zone>text{fill:${OVERVIEW_INK['--ae-fg']};font:600 18px "Instrument Sans Variable",sans-serif}
  .ec-overview__relation-zone rect{fill:${OVERVIEW_INK['--ae-surface']};stroke:${OVERVIEW_INK['--ae-border-control']};stroke-width:2}
  .ec-overview__hatch{stroke:${OVERVIEW_INK['--ae-fg']};stroke-width:1}
  .ec-overview__node rect,.ec-overview__node path{stroke:${OVERVIEW_INK['--ae-fg-soft']};stroke-width:1.4}
  .ec-overview__node--entity rect{fill:${OVERVIEW_INK['--ae-surface-raised']}}
  .ec-overview__node--relation path{fill:${OVERVIEW_INK['--ae-accent-bg']}}
  .ec-overview__node text{fill:${OVERVIEW_INK['--ae-fg-strong']};font:600 12px "IBM Plex Mono",monospace}
  .ec-overview__legend text{fill:${OVERVIEW_INK['--ae-fg-soft']};font:500 13px "Instrument Sans Variable",sans-serif}
`;

const GROUP_BOUNDS: Record<
  CatalogGroup,
  { x: number; y: number; width: number; height: number }
> = {
  Career: { x: 80, y: 40, width: 470, height: 410 },
  Content: { x: 80, y: 515, width: 470, height: 420 },
  'Job search': { x: 1110, y: 55, width: 410, height: 300 },
  Life: { x: 1090, y: 390, width: 430, height: 345 },
  'Long tail': { x: 700, y: 750, width: 620, height: 215 },
};

function coordinates(node: CatalogGraphNode): { x: number; y: number } {
  return { x: node.structuredX + OFFSET_X, y: node.structuredY + OFFSET_Y };
}

export function EntityCatalogOverview({
  svgRef,
  className = '',
  idPrefix,
}: {
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
  /**
   * Namespace for the three document-unique ids this sheet owns. It defaults
   * to a per-instance value because the diagram is mounted more than once at
   * a time: the export snapshot keeps a copy while the A4 atlas renders
   * another, and with a fixed id the visible wildcard node resolved its
   * pattern through the hidden copy.
   */
  idPrefix?: string;
}) {
  const uid = useId();
  const prefix = idPrefix ?? `ec-overview-${uid.replace(/[^a-zA-Z0-9]/g, '')}`;
  const titleId = `${prefix}-title`;
  const descId = `${prefix}-desc`;
  const patternId = `${prefix}-any-pattern`;

  return (
    <svg
      ref={svgRef}
      className={`ec-overview ${className}`.trim()}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={titleId}>Vitae complete entity and relation map</title>
      <desc id={descId}>
        All entity types are grouped around first-class relation diamonds. The canonical
        relation matrix on the next sheet lists the exact source and target types every
        relation accepts.
      </desc>
      <defs>
        <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse">
          <path className="ec-overview__hatch" d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" />
        </pattern>
      </defs>

      <rect className="ec-overview__backdrop" width={VIEW_WIDTH} height={VIEW_HEIGHT} rx="26" />

      {ENTITY_GROUPS.map((group) => {
        const bounds = GROUP_BOUNDS[group.label];
        return (
          <g key={group.label} className="ec-overview__group" data-group={group.label}>
            <rect {...bounds} rx="20" />
            <text x={bounds.x + 18} y={bounds.y + 28}>
              {group.label}
            </text>
          </g>
        );
      })}

      <g className="ec-overview__relation-zone">
        <rect x="570" y="60" width="510" height="675" rx="24" />
        <text x="592" y="91">
          Relation vocabulary
        </text>
      </g>

      <g className="ec-overview__nodes">
        {CATALOG_GRAPH.nodes.map((node) => {
          const { x, y } = coordinates(node);
          if (node.kind === 'relation') {
            return (
              <g
                key={node.id}
                className="ec-overview__node ec-overview__node--relation"
                transform={`translate(${x} ${y})`}
              >
                <path d="M 0 -27 L 51 0 L 0 27 L -51 0 Z" />
                <text
                  className="ec-overview__relation-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {node.label}
                </text>
              </g>
            );
          }
          if (node.kind === 'any') {
            return (
              <g
                key={node.id}
                className="ec-overview__node ec-overview__node--any"
                transform={`translate(${x} ${y})`}
              >
                <path
                  d="M-63 -24 L-50 -38 H50 L63 -24 V24 L50 38 H-50 L-63 24 Z"
                  fill={`url(#${patternId})`}
                />
                <text textAnchor="middle" dominantBaseline="central">
                  Any entity
                </text>
              </g>
            );
          }
          return (
            <g
              key={node.id}
              className="ec-overview__node ec-overview__node--entity"
              data-group={node.group}
              transform={`translate(${x} ${y})`}
            >
              <rect x="-62" y="-24" width="124" height="48" rx="11" />
              <text textAnchor="middle" dominantBaseline="central">
                {node.label}
              </text>
            </g>
          );
        })}
      </g>

      <g className="ec-overview__legend" transform="translate(88 970)">
        <text>Rectangle = entity</text>
        <text x="180">Diamond = relation</text>
        <text x="370">Pattern = wildcard endpoint</text>
        <text x="650">Exact endpoints on the canonical relation matrix</text>
        <text x="1150">
          {CATALOG_COUNTS.nodes} entities · {CATALOG_COUNTS.edges} relations
        </text>
      </g>
    </svg>
  );
}
