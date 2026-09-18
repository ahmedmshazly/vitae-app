/**
 * Universal typed-connection composer for entity create/edit forms.
 *
 * Curated sub-editors remain useful shortcuts ("Employer", "Skills", ...), but
 * they cannot anticipate every valid graph relationship. This composer uses
 * the same endpoint matrix enforced by the API and always includes RELATES_TO,
 * so every node type can link to every other node type before the node is
 * saved: not only afterward from the record page.
 */
import { useMemo, useState } from 'react';
import { Button, Chip, EntityGlyph, Field, Select } from '@vitae/ui';
import {
  connectionOptionSelectLabel,
  connectionOptionsFor,
  type ConnectionOption,
  type EdgeSubEditor,
  type NodeType,
} from '@vitae/core';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { InlinePropInput, newDraftKey, type ConnectionDraft } from './EdgeSubEditorRow.js';

export type { ConnectionOption };

/** @deprecated Prefer importing connectionOptionsFor from @vitae/core. */
export { connectionOptionsFor } from '@vitae/core';

export function additionalConnectionSub(option: ConnectionOption): EdgeSubEditor {
  return {
    edgeType: option.descriptor.type,
    direction: option.direction,
    label: option.descriptor.label,
    targetTypes: option.targetTypes,
    cardinality: 'many',
    // Object-list edge props need a richer editor; all scalar edge metadata is
    // editable here and object-list values already on an edge are preserved.
    inlineProps: option.descriptor.fields.filter((field) => field.widget !== 'object-list'),
    help: option.descriptor.description,
  };
}

export function ConnectionComposer({
  nodeType,
  drafts,
  onChange,
}: {
  nodeType: NodeType;
  drafts: ConnectionDraft[];
  onChange: (next: ConnectionDraft[]) => void;
}) {
  const options = useMemo(() => connectionOptionsFor(nodeType), [nodeType]);
  const [optionKey, setOptionKey] = useState<string>();
  const [target, setTarget] = useState<PickedEntity | null>(null);
  const [props, setProps] = useState<Record<string, unknown>>({});
  const selected = options.find((option) => option.key === optionKey);
  const additional = drafts.filter((draft) => draft.kind === 'additional');

  function resetComposer() {
    setOptionKey(undefined);
    setTarget(null);
    setProps({});
  }

  function addConnection() {
    if (!selected || !target) return;
    onChange([
      ...drafts,
      {
        key: newDraftKey(),
        kind: 'additional',
        sub: additionalConnectionSub(selected),
        target,
        props,
      },
    ]);
    resetComposer();
  }

  return (
    <div className="connection-composer">
      <div className="edgesub__label">
        <span className="vt-fld__label">Any typed connection</span>
        <span className="u-faint">
          Link this {nodeType.replace(/_/g, ' ')} to any existing or new record.
        </span>
      </div>

      {additional.map((draft) => (
        <div key={draft.key} className="edgesub__row connection-composer__draft">
          <div className="connection-composer__identity">
            <EntityGlyph type={draft.target.type} size="sm" />
            <span className="edgesub__title">{draft.target.title}</span>
            <button
              type="button"
              className="vt-strlist__x"
              aria-label={`Unlink ${draft.target.title}`}
              onClick={() => onChange(drafts.filter((item) => item.key !== draft.key))}
            >
              ×
            </button>
          </div>
          <Chip mono>
            {draft.sub.direction === 'out' ? '→' : '←'} {draft.sub.label}
          </Chip>
          <Chip mono>{draft.target.type}</Chip>
          <div className="connection-composer__properties">
            {(draft.sub.inlineProps ?? []).map((field) => (
              <Field key={field.key} label={field.label} help={field.help}>
                <InlinePropInput
                  field={field}
                  ownerType={draft.sub.edgeType}
                  value={draft.props[field.key]}
                  onChange={(value) =>
                    onChange(
                      drafts.map((item) =>
                        item.key === draft.key
                          ? { ...item, props: { ...item.props, [field.key]: value } }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
            ))}
          </div>
        </div>
      ))}

      <div className="connection-composer__controls">
        <Field
          label="Relationship"
          htmlFor={`connection-type-${nodeType}`}
          help={selected?.descriptor.description}
        >
          <Select
            id={`connection-type-${nodeType}`}
            value={optionKey}
            onChange={(value) => {
              setOptionKey(value);
              setTarget(null);
              setProps({});
            }}
            options={options.map((option) => ({
              value: option.key,
              label: connectionOptionSelectLabel(option),
            }))}
            placeholder="Choose how they relate..."
            clearable={false}
          />
        </Field>

        {selected && (
          <Field label={selected.direction === 'out' ? 'To' : 'From'}>
            {target ? (
              <div className="edgesub__row">
                <EntityGlyph type={target.type} size="sm" />
                <span className="edgesub__title">{target.title}</span>
                <Chip mono>{target.type}</Chip>
                <button
                  type="button"
                  className="vt-strlist__x"
                  aria-label="Clear target"
                  onClick={() => setTarget(null)}
                >
                  ×
                </button>
              </div>
            ) : (
              <EntityPicker
                key={selected.targetTypes.join(',')}
                types={selected.targetTypes}
                excludeIds={additional.map((draft) => draft.target.id)}
                placeholder="Search or create a record..."
                onPick={setTarget}
              />
            )}
          </Field>
        )}
      </div>

      {selected && target && selected.descriptor.fields.length > 0 && (
        <div className="entity-form__grid">
          {selected.descriptor.fields
            .filter((field) => field.widget !== 'object-list')
            .map((field) => (
              <Field key={field.key} label={field.label} help={field.help}>
                <InlinePropInput
                  field={field}
                  ownerType={selected.descriptor.type}
                  value={props[field.key]}
                  onChange={(value) => setProps((current) => ({ ...current, [field.key]: value }))}
                />
              </Field>
            ))}
        </div>
      )}

      <Button type="button" glyph="plus" disabled={!selected || !target} onClick={addConnection}>
        Add connection
      </Button>
    </div>
  );
}
