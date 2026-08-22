import type { Ref } from 'react';
import {
  CATALOG_COUNTS,
  CATALOG_ENTITIES,
  CATALOG_META,
  CATALOG_RELATIONS,
  EDGE_ENVELOPE,
  ENTITY_GROUPS,
  NODE_ENVELOPE,
  ORG_RELATION_KINDS,
  PERSON_RELATIONS,
  endpointText,
} from './entityCatalogModel.js';
import { FieldTable } from './EntityCatalogDetails.js';
import { EntityCatalogOverview } from './EntityCatalogOverview.js';
import {
  DEFAULT_OBSERVATORY_STATE,
  cloneObservatoryState,
} from './entityObservatoryModel.js';
import { EntityObservatorySnapshot } from './EntityObservatorySnapshot.js';

const CANONICAL_MATRIX_STATE = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
CANONICAL_MATRIX_STATE.lens = 'matrix';

/**
 * Direction is the whole content of a directed-edge catalog, and an arrow on
 * its own is announced inconsistently or not at all. The glyph stays as the
 * compact mark the printed sheet needs; the word rides along for anyone
 * reading the page rather than looking at it.
 */
function Direction({ direction }: { direction: 'out' | 'in' }) {
  return (
    <strong>
      <span aria-hidden>{direction === 'out' ? '→' : '←'}</span>
      <span className="u-visually-hidden">{direction === 'out' ? 'outgoing' : 'incoming'}</span>
    </strong>
  );
}

function AtlasHeader({
  title,
  meta,
}: {
  title: string;
  meta: string;
}) {
  return (
    <header className="ec-atlas__header">
      <div>
        <span className="ec-atlas__kicker">Vitae · schema atlas</span>
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
    </header>
  );
}

export function EntityCatalogAtlas({
  visible,
  svgRef,
}: {
  visible: boolean;
  svgRef?: Ref<SVGSVGElement>;
}) {
  return (
    <section
      className={`ec-atlas${visible ? ' ec-atlas--visible' : ''}`}
      aria-label="Printable Vitae entity atlas"
    >
      <article className="ec-atlas__sheet ec-atlas__sheet--overview" data-sheet="overview">
        <div className="ec-atlas__overview-title">
          <div>
            <p>Vitae · life and career graph</p>
            {/* An h2, not an h1: the page banner above the tabs already owns
                the document's only h1, and it stays mounted on this tab. Every
                other sheet titles itself with an h2 too. */}
            <h2>Entity and relation map</h2>
          </div>
          <dl>
            <div><dt>Entities</dt><dd>{CATALOG_COUNTS.nodes}</dd></div>
            <div><dt>Relations</dt><dd>{CATALOG_COUNTS.edges}</dd></div>
            <div><dt>Schema</dt><dd>v{CATALOG_META.schemaVersion}</dd></div>
          </dl>
        </div>
        <EntityCatalogOverview svgRef={svgRef} />
      </article>

      <article className="ec-atlas__sheet ec-atlas__sheet--matrix" data-sheet="matrix">
        <AtlasHeader title="Canonical relation matrix" meta="Source rows · target columns" />
        <EntityObservatorySnapshot
          state={CANONICAL_MATRIX_STATE}
          monochrome
          title="Canonical Vitae entity relation matrix"
          idPrefix="ec-canonical-matrix"
        />
      </article>

      <div className="ec-atlas__detail">
        <article className="ec-atlas__sheet ec-atlas__sheet--anatomy">
          <AtlasHeader title="Shared anatomy" meta="Node and edge envelopes" />
          <div className="ec-atlas__anatomy-grid">
            <section>
              <h3>Every node</h3>
              <p>{NODE_ENVELOPE.description}</p>
              <FieldTable
                fields={[...NODE_ENVELOPE.createFields]}
                label="Node create fields"
                compact
              />
            </section>
            <section>
              <h3>Every edge</h3>
              <p>{EDGE_ENVELOPE.description}</p>
              <FieldTable
                fields={[...EDGE_ENVELOPE.createFields]}
                label="Edge create fields"
                compact
              />
            </section>
            <section>
              <h3>Node system fields</h3>
              <FieldTable
                fields={[...NODE_ENVELOPE.systemFields]}
                label="Node system fields"
                compact
              />
            </section>
            <section>
              <h3>Edge system fields</h3>
              <FieldTable
                fields={[...EDGE_ENVELOPE.systemFields]}
                label="Edge system fields"
                compact
              />
            </section>
          </div>
          <div className="ec-atlas__notes">Review notes</div>
        </article>

        {ENTITY_GROUPS.map((group) => {
          const entities = CATALOG_ENTITIES.filter((entity) => entity.group === group.label);
          return (
            <article key={group.label} className="ec-atlas__sheet ec-atlas__sheet--group">
              <AtlasHeader title={group.label} meta={`${entities.length} entity types`} />
              {/* A register of records, so a list: without it these were the
                  largest unnumbered run of divs on the sheet. `role` is
                  explicit because the grid display drops list semantics in
                  some browsers. */}
              <ul
                className="ec-atlas__card-grid"
                role="list"
                aria-label={`${group.label} entity types`}
              >
                {entities.map((entity) => (
                  <li key={entity.type} className="ec-atlas-card">
                    <header>
                      <div>
                        <span>Entity</span>
                        <h3><code>{entity.type}</code></h3>
                      </div>
                      <small>title: {entity.titleLabel}</small>
                    </header>
                    <FieldTable fields={entity.fields} label={`${entity.type} properties`} compact />
                    <div className="ec-atlas-card__relations">
                      {entity.subject ? (
                        <p>
                          <strong>Subject</strong> · <code>{entity.subject.edgeType}</code>{' '}
                          {entity.subject.direction} · {entity.subject.required ? 'required' : 'optional'}
                        </p>
                      ) : null}
                      {entity.formEdges.map((edge, index) => (
                        <p key={`${edge.edgeType}-${index}`}>
                          <Direction direction={edge.direction} />{' '}
                          <code>{edge.edgeType}</code> · {endpointText(edge.targets)} · {edge.cardinality}
                        </p>
                      ))}
                      {entity.envelopeDates ? <p><strong>Envelope</strong> · start/end dates</p> : null}
                    </div>
                    {entity.notes ? <p className="ec-atlas-card__note">{entity.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}

        <article className="ec-atlas__sheet ec-atlas__sheet--relations">
          <AtlasHeader title="Relations" meta={`${CATALOG_RELATIONS.length} directed edge types`} />
          <ul className="ec-atlas__relation-grid" role="list" aria-label="Directed relation types">
            {CATALOG_RELATIONS.map((relation) => (
              <li key={relation.type} className="ec-atlas-card ec-atlas-card--relation">
                <header>
                  <div>
                    <span>Relation</span>
                    <h3><code>{relation.type}</code></h3>
                  </div>
                  <small>{relation.label}</small>
                </header>
                <p className="ec-atlas-card__endpoints">
                  {endpointText(relation.sources)}{' '}
                  <strong>
                    <span aria-hidden>→</span>
                    <span className="u-visually-hidden">to</span>
                  </strong>{' '}
                  {endpointText(relation.targets)}
                </p>
                {relation.allowedPairs.length > 0 ? (
                  <p className="ec-atlas-card__pairs">
                    Exact: {relation.allowedPairs.map(([source, target]) => `${source} → ${target}`).join('; ')}
                  </p>
                ) : null}
                <p>{relation.description}</p>
                <FieldTable fields={relation.fields} label={`${relation.type} properties`} compact />
                {relation.notes ? <p className="ec-atlas-card__note">{relation.notes}</p> : null}
              </li>
            ))}
          </ul>
        </article>

        <article className="ec-atlas__sheet ec-atlas__sheet--enums">
          <AtlasHeader title="Relation enums" meta="Controlled relationship vocabulary" />
          <div className="ec-atlas__enum-grid">
            <section>
              <h3><code>PERSON_RELATIONS</code></h3>
              <p>Allowed values for <code>KNOWS.props.relation</code>.</p>
              <ol>{PERSON_RELATIONS.map((value) => <li key={value}><code>{value}</code></li>)}</ol>
            </section>
            <section>
              <h3><code>ORG_RELATION_KINDS</code></h3>
              <p>Required values for <code>ORG_RELATED.props.kind</code>.</p>
              <ol>{ORG_RELATION_KINDS.map((value) => <li key={value}><code>{value}</code></li>)}</ol>
            </section>
            <section className="ec-atlas__notation">
              <h3>Notation</h3>
              <dl>
                <div><dt><code>A → B</code></dt><dd>directed source to target</dd></div>
                <div><dt><code>→</code> / <code>←</code></dt><dd>outgoing / incoming from this entity</dd></div>
                <div><dt>Any entity</dt><dd>wildcard endpoint (<code>*</code>)</dd></div>
                <div><dt>required</dt><dd>the field must be supplied</dd></div>
                <div><dt>default</dt><dd>value applied when omitted</dd></div>
                <div><dt>nullable</dt><dd>explicit <code>null</code> is accepted</dd></div>
              </dl>
            </section>
          </div>
          <div className="ec-atlas__notes ec-atlas__notes--large">Review notes</div>
        </article>
      </div>
    </section>
  );
}
