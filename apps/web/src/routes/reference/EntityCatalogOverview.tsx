import type { Ref } from 'react';
import {
  CATALOG_GRAPH,
  ENTITY_GROUPS,
  type CatalogGraphNode,
  type CatalogGroup,
} from './entityCatalogModel.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 1000;
const OFFSET_X = VIEW_WIDTH / 2;
const OFFSET_Y = VIEW_HEIGHT / 2;

export const OVERVIEW_SVG_EXPORT_STYLE = `
  .ec-overview__backdrop{fill:#0f0f0f;stroke:#2b2b2b;stroke-width:2}
  .ec-overview__group rect{fill:#151515;stroke:#3f3f3f;stroke-width:2}
  .ec-overview__group>text,.ec-overview__relation-zone>text{fill:#e8e8e6;font:600 18px "Instrument Sans Variable",sans-serif}
  .ec-overview__relation-zone rect{fill:#151515;stroke:#727271;stroke-width:2}
  #ec-any-pattern path{stroke:#e8e8e6;stroke-width:1}
  .ec-overview__node rect,.ec-overview__node path{stroke:#c9c9c6;stroke-width:1.4}
  .ec-overview__node--entity rect{fill:#1c1c1c}
  .ec-overview__node--relation path{fill:#262626}
  .ec-overview__node--any path{fill:url(#ec-any-pattern)}
  .ec-overview__node text{fill:#fafaf8;font:600 12px "IBM Plex Mono",monospace}
  .ec-overview__node--relation .ec-overview__relation-label{font-size:10px}
  .ec-overview__node--relation .ec-overview__endpoint-signature{fill:#c9c9c6;font-size:6.5px}
  .ec-overview__legend text{fill:#c9c9c6;font:500 13px "Instrument Sans Variable",sans-serif}
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

const GROUP_CODES: Record<CatalogGraphNode['group'], string> = {
  Career: 'C',
  Content: 'Co',
  'Job search': 'J',
  Life: 'L',
  'Long tail': 'T',
  Relations: 'R',
  Universal: '*',
};

const GROUP_ORDER: CatalogGraphNode['group'][] = [
  'Career',
  'Content',
  'Job search',
  'Life',
  'Long tail',
  'Universal',
  'Relations',
];

function endpointSignature(
  relationId: string,
  nodeById: Map<string, CatalogGraphNode>,
): string {
  function groupsFor(role: 'source' | 'target'): string {
    const groups = new Set<CatalogGraphNode['group']>();
    for (const link of CATALOG_GRAPH.links) {
      if (link.relationId !== relationId || link.role !== role) continue;
      const endpoint = nodeById.get(role === 'source' ? link.source : link.target);
      if (endpoint) groups.add(endpoint.group);
    }
    return GROUP_ORDER.filter((group) => groups.has(group))
      .map((group) => GROUP_CODES[group])
      .join('·');
  }
  return `${groupsFor('source')} → ${groupsFor('target')}`;
}

export function EntityCatalogOverview({
  svgRef,
  className = '',
}: {
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
}) {
  const nodeById = new Map(CATALOG_GRAPH.nodes.map((node) => [node.id, node]));

  return (
    <svg
      ref={svgRef}
      className={`ec-overview ${className}`.trim()}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-labelledby="ec-overview-title ec-overview-desc"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="ec-overview-title">Vitae complete entity and relation map</title>
      <desc id="ec-overview-desc">
        All entity types are grouped around first-class relation diamonds. Each relation shows
        a compact source-to-target group signature; exact endpoints are listed in the matrix.
      </desc>
      <defs>
        <pattern id="ec-any-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" />
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
          Relation vocabulary · endpoint group signatures
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
                  y="-5"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {node.label}
                </text>
                <text
                  className="ec-overview__endpoint-signature"
                  y="12"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {endpointSignature(node.id, nodeById)}
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
                <path d="M-63 -24 L-50 -38 H50 L63 -24 V24 L50 38 H-50 L-63 24 Z" />
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
        <text x="650">C/Co/J/L/T = endpoint groups · exact pairs on matrix</text>
        <text x="1120">34 entities · 28 relations</text>
      </g>
    </svg>
  );
}
