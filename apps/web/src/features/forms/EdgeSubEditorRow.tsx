/**
 * Inline relationship editor inside an entity form (FR-CAP-002): one
 * EdgeSubEditor descriptor → picker + chosen-target rows with per-edge props.
 * State is owned by EntityForm (ConnectionDraft[]), committed after node save.
 */
import { Checkbox, EntityGlyph, Input, Rating, Select, TagInput } from '@vitae/ui';
import { suggestSourceFor, type EdgeSubEditor, type FieldDescriptor } from '@vitae/core';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { SuggestTagInput } from './SuggestTagInput.js';
import { SuggestTextInput } from './SuggestTextInput.js';

export interface ConnectionDraft {
  /** Stable client key. */
  key: string;
  /** Connections composed through the universal editor rather than a curated row. */
  kind?: 'additional';
  sub: EdgeSubEditor;
  target: PickedEntity;
  props: Record<string, unknown>;
  /** Set when this draft mirrors an existing edge (edit mode). */
  edgeId?: string;
}

let draftSeq = 0;
export function newDraftKey(): string {
  return `draft-${++draftSeq}`;
}

export function InlinePropInput({
  field,
  ownerType,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  /** Edge type being edited, suggestions come from this prop on other edges of it. */
  ownerType: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.widget === 'rating') {
    return (
      <Rating
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
        max={field.max ?? 5}
        label={field.label}
      />
    );
  }
  // `suggest-list` is a list field, like `tags`, but backed by /suggest. Without
  // its own branch it fell through to the plain text input below and emitted a
  // *string*, so KNOWS.topics arrived as "Business" instead of ["Business"] and
  // the API rejected the whole edge with a 422 that named no field the form
  // showed. Any list-shaped widget must produce an array here.
  if (field.widget === 'suggest-list') {
    return (
      <SuggestTagInput
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={onChange}
        kind={field.suggestKind ?? 'topic'}
        placeholder={field.placeholder ?? field.label}
        mono={field.mono}
      />
    );
  }
  if (field.widget === 'tags') {
    return (
      <TagInput
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={onChange}
        placeholder={field.placeholder ?? field.label}
      />
    );
  }
  if (field.widget === 'checkbox') {
    return <Checkbox checked={value === true} onChange={onChange} label={field.label} />;
  }
  if (field.widget === 'select') {
    return (
      <Select
        value={typeof value === 'string' ? value : undefined}
        onChange={onChange}
        options={field.options ?? []}
        placeholder={field.label}
      />
    );
  }
  if (field.widget === 'number') {
    return (
      <Input
        mono
        type="number"
        placeholder={field.label}
        min={field.min}
        max={field.max}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    );
  }
  if (field.widget === 'date') {
    return (
      <Input
        mono
        type="date"
        aria-label={field.label}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  }
  // Same rule as the node forms: a text field shows what has been typed before,
  // and free text always wins. Reached by `text` and by any widget without a
  // branch above, which is safe here because those are all scalar.
  return (
    <SuggestTextInput
      aria-label={field.label}
      placeholder={field.placeholder ?? field.label}
      value={typeof value === 'string' ? value : ''}
      onChange={(v) => onChange(v || undefined)}
      source={suggestSourceFor(ownerType, field)}
      propKey={field.key}
      mono={field.mono}
    />
  );
}

export function EdgeSubEditorRow({
  sub,
  drafts,
  onChange,
}: {
  sub: EdgeSubEditor;
  drafts: ConnectionDraft[];
  onChange: (next: ConnectionDraft[]) => void;
}) {
  const mine = drafts.filter(
    (d) =>
      d.kind !== 'additional' &&
      d.sub.edgeType === sub.edgeType &&
      d.sub.direction === sub.direction &&
      d.sub.label === sub.label,
  );
  const canAdd = sub.cardinality === 'many' || mine.length === 0;

  return (
    <div className="edgesub">
      <div className="edgesub__label">
        <span className="vt-fld__label">{sub.label}</span>
        <span className="u-faint u-mono edgesub__type">{sub.edgeType}</span>
      </div>
      {mine.map((d) => (
        <div key={d.key} className="edgesub__row">
          <EntityGlyph type={d.target.type} size="sm" />
          <span className="edgesub__title">{d.target.title}</span>
          {(sub.inlineProps ?? []).map((f) => (
            <span key={f.key} className="edgesub__prop">
              <InlinePropInput
                field={f}
                ownerType={sub.edgeType}
                value={d.props[f.key]}
                onChange={(v) =>
                  onChange(
                    drafts.map((x) =>
                      x.key === d.key ? { ...x, props: { ...x.props, [f.key]: v } } : x,
                    ),
                  )
                }
              />
            </span>
          ))}
          <button
            type="button"
            className="vt-strlist__x"
            aria-label={`Unlink ${d.target.title}`}
            onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}
          >
            ×
          </button>
        </div>
      ))}
      {canAdd && (
        <EntityPicker
          types={sub.targetTypes}
          excludeIds={mine.map((d) => d.target.id)}
          placeholder={`Link ${sub.label.toLowerCase()}…`}
          onPick={(target) =>
            onChange([...drafts, { key: newDraftKey(), sub, target, props: {} }])
          }
        />
      )}
      {sub.help && <span className="vt-fld__help">{sub.help}</span>}
    </div>
  );
}
