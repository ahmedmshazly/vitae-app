import { useMemo, type Ref } from 'react';
import {
  CATALOG_COUNTS,
  CATALOG_RELATIONS,
  CATALOG_META,
} from './entityCatalogModel.js';
import {
  OBSERVATORY_GROUP_COLORS,
  buildFocusScene,
  buildObservatoryMatrix,
  buildOrbitScene,
  type ObservatoryScene,
  type ObservatoryWorkspaceState,
} from './entityObservatoryModel.js';

function colorForGroup(group: string): string {
  if (group === 'Relations') return '#c9c9c6';
  if (group === 'Universal') return '#3f3f3f';
  return (
    OBSERVATORY_GROUP_COLORS[group as keyof typeof OBSERVATORY_GROUP_COLORS] ?? '#a3a3a0'
  );
}

function GraphSnapshot({
  scene,
  state,
  monochrome,
  markerId,
}: {
  scene: ObservatoryScene;
  state: ObservatoryWorkspaceState;
  monochrome: boolean;
  markerId: string;
}) {
  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={monochrome ? '#555' : '#c9c9c6'} />
        </marker>
      </defs>
      {state.lens === 'orbit'
        ? scene.nodes
            .filter((node) => node.kind === 'group')
            .map((node) => (
              <ellipse
                key={`halo:${node.id}`}
                cx={node.x}
                cy={node.y}
                rx="185"
                ry="132"
                fill={monochrome ? '#fff' : colorForGroup(node.group)}
                fillOpacity={monochrome ? 1 : 0.055}
                stroke={monochrome ? '#777' : colorForGroup(node.group)}
                strokeOpacity={monochrome ? 1 : 0.38}
                strokeDasharray="7 6"
              />
            ))
        : null}
      <g>
        {scene.edges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target) return null;
          const midX = edge.bundled ? (source.x + target.x) * 0.22 : (source.x + target.x) / 2;
          const midY = edge.bundled ? (source.y + target.y) * 0.22 : (source.y + target.y) / 2;
          return (
            <path
              key={edge.id}
              d={`M${source.x} ${source.y} Q${midX} ${midY} ${target.x} ${target.y}`}
              fill="none"
              stroke={monochrome ? '#777' : edge.active ? '#c9c9c6' : '#2b2b2b'}
              strokeOpacity={edge.active ? 0.92 : Math.max(0.2, state.display.routeOpacity * 0.55)}
              strokeWidth={Math.max(0.7, state.display.routeThickness * (edge.active ? 2 : 1))}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </g>
      <g>
        {scene.nodes.map((node) => {
          const color = monochrome ? '#111' : colorForGroup(node.group);
          if (node.kind === 'group') {
            return (
              <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                <rect
                  x="-62"
                  y="-21"
                  width="124"
                  height="42"
                  rx="17"
                  fill={monochrome ? '#fff' : '#0f0f0f'}
                  stroke={color}
                  strokeWidth="1.5"
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={color}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fontSize="14"
                  fontWeight="700"
                >
                  {node.label}
                </text>
              </g>
            );
          }
          const selected = node.selected || node.compared;
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
              {selected ? (
                <circle r="24" fill="none" stroke={color} strokeWidth="5" opacity="0.28" />
              ) : null}
              {node.kind === 'relation' ? (
                <path
                  d="M0 -12 L19 0 L0 12 L-19 0 Z"
                  fill={monochrome ? '#ddd' : color}
                  stroke={monochrome ? '#111' : '#c9c9c6'}
                />
              ) : (
                <rect
                  x="-34"
                  y="-13"
                  width="68"
                  height="26"
                  rx={node.kind === 'any' ? 13 : 7}
                  fill={monochrome ? '#fff' : color}
                  fillOpacity={monochrome ? 1 : 0.88}
                  stroke={monochrome ? '#111' : '#c9c9c6'}
                />
              )}
              {node.showLabel ? (
                <text
                  y={node.kind === 'relation' ? 25 : 27}
                  textAnchor="middle"
                  fill={monochrome ? '#111' : '#e8e8e6'}
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize={node.kind === 'relation' ? 9 : 10}
                  fontWeight={selected ? 700 : 500}
                >
                  {node.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </>
  );
}

function MatrixSnapshot({
  state,
  monochrome,
}: {
  state: ObservatoryWorkspaceState;
  monochrome: boolean;
}) {
  const matrix = useMemo(() => buildObservatoryMatrix(state), [state]);
  const entities = matrix.entities;
  const count = entities.length;
  const cell = Math.min(22, 720 / Math.max(count, 1));
  const originX = 176;
  const originY = 170;
  const relationIndex = new Map(
    CATALOG_RELATIONS.map((relation, index) => [relation.id, index + 1]),
  );
  return (
    <>
      <text
        x="52"
        y="112"
        fill={monochrome ? '#111' : '#e8e8e6'}
        fontFamily="IBM Plex Mono, monospace"
        fontSize="14"
        fontWeight="700"
      >
        SOURCE ↓ · TARGET →
      </text>
      {entities.map((entity, index) => {
        const color = monochrome ? '#111' : colorForGroup(entity.group);
        return (
          <g key={`headers:${entity.id}`}>
            <text
              x={originX - 8}
              y={originY + index * cell + cell * 0.72}
              textAnchor="end"
              fill={color}
              fontFamily="IBM Plex Mono, monospace"
              fontSize="8"
              fontWeight="600"
            >
              {entity.label}
            </text>
            <text
              transform={`translate(${originX + index * cell + cell * 0.58} ${originY - 8}) rotate(-58)`}
              textAnchor="start"
              fill={color}
              fontFamily="IBM Plex Mono, monospace"
              fontSize="8"
              fontWeight="600"
            >
              {entity.label}
            </text>
          </g>
        );
      })}
      {entities.flatMap((source, row) =>
        entities.map((target, column) => {
          const entry = matrix.cells.get(`${source.id}|${target.id}`);
          const codes = entry?.relations.map((relation) => relationIndex.get(relation.id) ?? 0) ?? [];
          return (
            <g key={`${source.id}:${target.id}`}>
              <rect
                x={originX + column * cell}
                y={originY + row * cell}
                width={cell}
                height={cell}
                fill={
                  entry
                    ? monochrome
                      ? '#ddd'
                      : codes.length > 1
                        ? '#a87bc0'
                        : '#262626'
                    : monochrome
                      ? '#fff'
                      : '#151515'
                }
                stroke={monochrome ? '#aaa' : '#2b2b2b'}
                strokeWidth="0.65"
              />
              {codes.length ? (
                <text
                  x={originX + column * cell + cell / 2}
                  y={originY + row * cell + cell * 0.67}
                  textAnchor="middle"
                  fill={monochrome ? '#111' : '#fff'}
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize={codes.length > 1 ? 5.3 : 7}
                  fontWeight="700"
                >
                  {codes.join('·')}
                </text>
              ) : null}
            </g>
          );
        }),
      )}
      <g transform="translate(990 155)">
        <text
          fill={monochrome ? '#111' : '#e8e8e6'}
          fontFamily="IBM Plex Sans, sans-serif"
          fontSize="17"
          fontWeight="700"
        >
          Relation key
        </text>
        {CATALOG_RELATIONS.map((relation, index) => {
          const column = Math.floor(index / 14);
          const row = index % 14;
          return (
            <g key={relation.id} transform={`translate(${column * 280} ${36 + row * 36})`}>
              <rect
                width="26"
                height="21"
                rx="5"
                fill={monochrome ? '#ddd' : '#262626'}
                stroke={monochrome ? '#111' : '#fafaf8'}
              />
              <text
                x="13"
                y="14.5"
                textAnchor="middle"
                fill={monochrome ? '#111' : '#fff'}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="8"
                fontWeight="700"
              >
                {index + 1}
              </text>
              <text
                x="34"
                y="14.5"
                fill={monochrome ? '#111' : '#e8e8e6'}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="10"
              >
                {relation.type}
              </text>
            </g>
          );
        })}
      </g>
    </>
  );
}

export function EntityObservatorySnapshot({
  state,
  scene,
  svgRef,
  monochrome = false,
  title = 'Vitae Schema Observatory',
  idPrefix = 'ec-workspace',
}: {
  state: ObservatoryWorkspaceState;
  scene?: ObservatoryScene;
  svgRef?: Ref<SVGSVGElement>;
  monochrome?: boolean;
  title?: string;
  idPrefix?: string;
}) {
  const resolvedScene =
    scene ?? (state.lens === 'focus' ? buildFocusScene(state) : buildOrbitScene(state));
  return (
    <svg
      ref={svgRef}
      className="ec-observatory-snapshot"
      viewBox="-800 -500 1600 1000"
      role="img"
      aria-labelledby={`${idPrefix}-title ${idPrefix}-description`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={`${idPrefix}-title`}>{title}</title>
      <desc id={`${idPrefix}-description`}>
        {state.lens === 'matrix'
          ? `A complete source and target matrix for ${CATALOG_COUNTS.nodes} entities and ${CATALOG_COUNTS.edges} relations.`
          : `A ${state.lens} schema view with reveal-on-demand relationship routes.`}
      </desc>
      <rect
        x="-800"
        y="-500"
        width="1600"
        height="1000"
        rx="28"
        fill={monochrome ? '#fff' : '#0f0f0f'}
        stroke={monochrome ? '#111' : '#3f3f3f'}
        strokeWidth="2"
      />
      <g transform={state.lens === 'matrix' ? 'translate(-800 -500)' : undefined}>
        {state.lens === 'matrix' ? (
          <MatrixSnapshot state={state} monochrome={monochrome} />
        ) : (
          <GraphSnapshot
            scene={resolvedScene}
            state={state}
            monochrome={monochrome}
            markerId={`${idPrefix}-arrow`}
          />
        )}
      </g>
      <g transform="translate(-750 450)">
        <text
          fill={monochrome ? '#111' : '#c9c9c6'}
          fontFamily="IBM Plex Mono, monospace"
          fontSize="13"
        >
          {state.lens.toUpperCase()} · {CATALOG_COUNTS.nodes} entities · {CATALOG_COUNTS.edges}{' '}
          relations · schema v{CATALOG_META.schemaVersion}
        </text>
      </g>
    </svg>
  );
}

export function EntityObservatoryPrint({
  state,
  scene,
}: {
  state: ObservatoryWorkspaceState;
  scene: ObservatoryScene;
}) {
  const matrixMappings =
    state.lens === 'matrix' ? buildObservatoryMatrix(state).relationCount : null;
  return (
    <section className="ec-workspace-print" aria-hidden="true">
      <article className="ec-workspace-print__sheet">
        <header>
          <div>
            <span>Vitae · Schema Observatory</span>
            <h1>{state.lens === 'matrix' ? 'Relation matrix' : `${state.lens} workspace`}</h1>
          </div>
          <dl>
            <div><dt>Groups</dt><dd>{state.filters.groups.length}</dd></div>
            <div><dt>Relations</dt><dd>{state.filters.relations.length}</dd></div>
            <div>
              <dt>{matrixMappings === null ? 'Routes' : 'Mappings'}</dt>
              <dd>{matrixMappings ?? scene.routeCount}</dd>
            </div>
          </dl>
        </header>
        <EntityObservatorySnapshot
          state={state}
          scene={scene}
          monochrome
          title="Current Vitae Schema Observatory workspace"
          idPrefix="ec-print-workspace"
        />
        <footer>
          <span>Filters: {state.filters.direction} · {state.display.edgeMode}</span>
          <span>
            Focus: {state.selectedIds.map((id) => id.replace(/^entity:|^relation:/, '')).join(', ') || 'none'}
          </span>
        </footer>
      </article>
    </section>
  );
}
