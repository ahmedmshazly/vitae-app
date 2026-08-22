import { Disclosure } from '@vitae/ui';
import {
  EDGE_ENVELOPE,
  NODE_ENVELOPE,
  endpointText,
  fieldSummary,
  type CatalogEntity,
  type CatalogField,
  type CatalogRelation,
  type CatalogSelection,
} from './entityCatalogModel.js';

/** The arrow is the compact mark; the word is what a reader actually hears. */
function Arrow({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden>→</span>
      <span className="u-visually-hidden">{label}</span>
    </>
  );
}

function FieldRow({
  field,
  depth = 0,
  compact = false,
}: {
  field: CatalogField;
  depth?: number;
  compact?: boolean;
}) {
  return (
    <>
      <tr className="ec-field" data-depth={depth}>
        <th scope="row">
          <code>{depth > 0 ? '↳ ' : ''}{field.key}</code>
          <span className="ec-field__label">{field.label}</span>
        </th>
        <td>
          {/* fieldSummary already writes "required" here in words. The column
              used to carry a coloured asterisk as well, which meant colour and
              an unexplained glyph were the only marks of the most consequential
              fact in the table, and `*` also means "wildcard endpoint" on the
              atlas notation sheet. */}
          <span className="ec-field__summary">{fieldSummary(field)}</span>
          {!compact && field.note ? <span className="ec-field__note">{field.note}</span> : null}
        </td>
      </tr>
      {field.children.map((child) => (
        <FieldRow key={`${field.key}.${child.key}`} field={child} depth={depth + 1} compact={compact} />
      ))}
    </>
  );
}

export function FieldTable({
  fields,
  label,
  compact = false,
}: {
  fields: CatalogField[];
  label: string;
  compact?: boolean;
}) {
  if (fields.length === 0) return <p className="ec-empty-inline">No relation properties.</p>;
  return (
    <table className={`ec-field-table${compact ? ' ec-field-table--compact' : ''}`}>
      <caption>{label}</caption>
      <tbody>
        {fields.map((field) => (
          <FieldRow key={field.key} field={field} compact={compact} />
        ))}
      </tbody>
    </table>
  );
}

export function EntityDetails({ entity }: { entity: CatalogEntity }) {
  return (
    <div className="ec-detail">
      <div className="ec-detail__eyebrow">{entity.group} · entity</div>
      <h2 className="ec-detail__title"><code>{entity.type}</code></h2>

      {/* Identity first, then a definition ledger: these facts used to be four
          prose sentences, so nothing was programmatically paired and no value
          lined up with the one above it. */}
      <dl className="ec-detail__facts">
        <div>
          <dt>Primary label</dt>
          <dd>{entity.titleLabel}</dd>
        </div>
        {entity.subtitleLabel ? (
          <div>
            <dt>Secondary label</dt>
            <dd>{entity.subtitleLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt>Dates</dt>
          <dd>{entity.envelopeDates ? 'Start and end enabled' : 'Not shown by default'}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>
            {entity.subject ? (
              <>
                {entity.subject.label} · <code>{entity.subject.edgeType}</code>{' '}
                {entity.subject.direction} · {entity.subject.required ? 'required' : 'optional'}
                {entity.subject.defaultToSelf ? ' · defaults to self' : ''}
              </>
            ) : (
              'Not required when creating this type'
            )}
          </dd>
        </div>
      </dl>

      <FieldTable fields={entity.fields} label={`${entity.type} properties`} />

      <div className="ec-detail__section">
        <h3>Inline relations</h3>
        {entity.formEdges.length > 0 ? (
          <ul className="ec-relation-list">
            {entity.formEdges.map((edge, index) => (
              <li key={`${edge.edgeType}-${edge.direction}-${index}`}>
                <span aria-hidden>{edge.direction === 'out' ? '→' : '←'}</span>
                <span className="u-visually-hidden">
                  {edge.direction === 'out' ? 'outgoing' : 'incoming'}
                </span>{' '}
                <code>{edge.edgeType}</code> · {edge.label} · {endpointText(edge.targets)} ·{' '}
                {edge.cardinality}
              </li>
            ))}
          </ul>
        ) : (
          <p>No inline relation editors; generic Add connection rules still apply.</p>
        )}
      </div>

      {entity.notes ? <p className="ec-detail__note">{entity.notes}</p> : null}

      <Disclosure label="Shared node fields" meta={NODE_ENVELOPE.createFields.length}>
        <FieldTable fields={[...NODE_ENVELOPE.createFields]} label="Shared node fields" />
      </Disclosure>
      <Disclosure label="System fields" meta={NODE_ENVELOPE.systemFields.length}>
        <FieldTable fields={[...NODE_ENVELOPE.systemFields]} label="Node system fields" />
      </Disclosure>
    </div>
  );
}

export function RelationDetails({ relation }: { relation: CatalogRelation }) {
  return (
    <div className="ec-detail">
      <div className="ec-detail__eyebrow">Relation · directed edge</div>
      <h2 className="ec-detail__title"><code>{relation.type}</code></h2>
      <p className="ec-detail__lead">{relation.description}</p>

      {/* Source and target are a term/value pair each. The separating arrow is
          drawn by the stylesheet, because a bare span between two rows is not
          allowed inside a dl and carries nothing a reader needs. */}
      <dl className="ec-endpoints">
        <div>
          <dt>Source</dt>
          <dd>{endpointText(relation.sources)}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{endpointText(relation.targets)}</dd>
        </div>
      </dl>

      {relation.allowedPairs.length > 0 ? (
        <div className="ec-detail__section">
          <h3>Exact allowed pairs</h3>
          <ul className="ec-relation-list">
            {relation.allowedPairs.map(([source, target]) => (
              <li key={`${source}-${target}`}>
                <code>{source}</code> <Arrow label="to" /> <code>{target}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FieldTable fields={relation.fields} label={`${relation.type} properties`} />
      {relation.notes ? <p className="ec-detail__note">{relation.notes}</p> : null}

      <Disclosure label="Shared edge fields" meta={EDGE_ENVELOPE.createFields.length}>
        <FieldTable fields={[...EDGE_ENVELOPE.createFields]} label="Shared edge fields" />
      </Disclosure>
      <Disclosure label="System fields" meta={EDGE_ENVELOPE.systemFields.length}>
        <FieldTable fields={[...EDGE_ENVELOPE.systemFields]} label="Edge system fields" />
      </Disclosure>
    </div>
  );
}

export function SelectionDetails({ selection }: { selection: CatalogSelection }) {
  if (selection.kind === 'entity') return <EntityDetails entity={selection} />;
  if (selection.kind === 'relation') return <RelationDetails relation={selection} />;
  return (
    <div className="ec-detail">
      <div className="ec-detail__eyebrow">Universal endpoint</div>
      <h2 className="ec-detail__title">Any entity</h2>
      <p className="ec-detail__lead">
        A compact stand-in for every entity type. It represents wildcard source or target rules
        without expanding the map into thousands of redundant lines.
      </p>
      <p>
        Select a connected relation diamond to see whether the wildcard applies to its source,
        target, or both.
      </p>
    </div>
  );
}
