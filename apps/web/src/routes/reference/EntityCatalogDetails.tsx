import {
  EDGE_ENVELOPE,
  ENTITY_GROUPS,
  NODE_ENVELOPE,
  endpointText,
  fieldSummary,
  type CatalogEntity,
  type CatalogField,
  type CatalogRelation,
  type CatalogSelection,
} from './entityCatalogModel.js';

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
          {field.required ? <span className="ec-required" title="Required">*</span> : null}
          <span className="ec-field__label">{field.label}</span>
        </th>
        <td>
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
      <p className="ec-detail__lead">
        Primary label: <strong>{entity.titleLabel}</strong>
        {entity.subtitleLabel ? <> · Secondary label: <strong>{entity.subtitleLabel}</strong></> : null}
      </p>

      <FieldTable fields={entity.fields} label={`${entity.type} properties`} />

      <div className="ec-detail__section">
        <h3>Creation and envelope</h3>
        <p>
          Dates: <strong>{entity.envelopeDates ? 'start/end enabled' : 'not shown by default'}</strong>
        </p>
        {entity.subject ? (
          <p>
            Subject: <strong>{entity.subject.label}</strong> ·{' '}
            <code>{entity.subject.edgeType}</code> {entity.subject.direction} ·{' '}
            {entity.subject.required ? 'required' : 'optional'}
            {entity.subject.defaultToSelf ? ' · defaults to self' : ''}
          </p>
        ) : (
          <p>No subject relationship is required when creating this type.</p>
        )}
      </div>

      <div className="ec-detail__section">
        <h3>Inline relations</h3>
        {entity.formEdges.length > 0 ? (
          <ul className="ec-relation-list">
            {entity.formEdges.map((edge, index) => (
              <li key={`${edge.edgeType}-${edge.direction}-${index}`}>
                <span aria-hidden>{edge.direction === 'out' ? '→' : '←'}</span>{' '}
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

      <details className="ec-disclosure">
        <summary>Shared node fields ({NODE_ENVELOPE.createFields.length})</summary>
        <FieldTable fields={[...NODE_ENVELOPE.createFields]} label="Shared node fields" />
      </details>
      <details className="ec-disclosure">
        <summary>System fields ({NODE_ENVELOPE.systemFields.length})</summary>
        <FieldTable fields={[...NODE_ENVELOPE.systemFields]} label="Node system fields" />
      </details>
    </div>
  );
}

export function RelationDetails({ relation }: { relation: CatalogRelation }) {
  return (
    <div className="ec-detail">
      <div className="ec-detail__eyebrow">Relation · directed edge</div>
      <h2 className="ec-detail__title"><code>{relation.type}</code></h2>
      <p className="ec-detail__lead">{relation.description}</p>

      <div className="ec-endpoints" aria-label="Allowed endpoints">
        <div>
          <span>Source</span>
          <strong>{endpointText(relation.sources)}</strong>
        </div>
        <span className="ec-endpoints__arrow" aria-hidden>→</span>
        <div>
          <span>Target</span>
          <strong>{endpointText(relation.targets)}</strong>
        </div>
      </div>

      {relation.allowedPairs.length > 0 ? (
        <div className="ec-detail__section">
          <h3>Exact allowed pairs</h3>
          <ul className="ec-relation-list">
            {relation.allowedPairs.map(([source, target]) => (
              <li key={`${source}-${target}`}><code>{source}</code> → <code>{target}</code></li>
            ))}
          </ul>
        </div>
      ) : null}

      <FieldTable fields={relation.fields} label={`${relation.type} properties`} />
      {relation.notes ? <p className="ec-detail__note">{relation.notes}</p> : null}

      <details className="ec-disclosure">
        <summary>Shared edge fields ({EDGE_ENVELOPE.createFields.length})</summary>
        <FieldTable fields={[...EDGE_ENVELOPE.createFields]} label="Shared edge fields" />
      </details>
      <details className="ec-disclosure">
        <summary>System fields ({EDGE_ENVELOPE.systemFields.length})</summary>
        <FieldTable fields={[...EDGE_ENVELOPE.systemFields]} label="Edge system fields" />
      </details>
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

export function groupLabelForType(type: string): string {
  return ENTITY_GROUPS.find((group) => (group.types as readonly string[]).includes(type))?.label ?? 'Other';
}
