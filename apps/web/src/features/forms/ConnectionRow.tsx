/**
 * Shared connection row: human edge label, neighbor link, edit props, unlink.
 * Used by Record and Person CRM Connections panels.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, ConfirmDialog, EntityGlyph, Field, Glyph, Popover } from '@vitae/ui';
import { EDGE_FORM_DESCRIPTORS, edgeDisplayLabel, isEdgeType } from '@vitae/core';
import { api } from '../../lib/api.js';
import { entityHref } from '../../lib/entity-href.js';
import { useToast } from '../Toast.js';
import { InlinePropInput } from './EdgeSubEditorRow.js';
import { SelectCheckbox } from '../BulkNodeDelete.js';

export interface ConnectionEdge {
  id: string;
  type: string;
  src: string;
  dst: string;
  props: Record<string, unknown>;
}

export function ConnectionRow({
  edge,
  nodeId,
  neighbors,
  selected,
  onToggleSelect,
}: {
  edge: ConnectionEdge;
  nodeId: string;
  neighbors: Record<string, { id: string; type: string; title: string }>;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(edge.props);

  const otherId = edge.src === nodeId ? edge.dst : edge.src;
  const other = neighbors[otherId];
  const direction = edge.src === nodeId ? 'out' : 'in';
  const label = edgeDisplayLabel(edge.type, direction, {
    relation: typeof edge.props.relation === 'string' ? edge.props.relation : undefined,
    kind: typeof edge.props.kind === 'string' ? edge.props.kind : undefined,
  });
  const descriptor = isEdgeType(edge.type) ? EDGE_FORM_DESCRIPTORS[edge.type] : undefined;
  const editableFields = (descriptor?.fields ?? []).filter((f) => f.widget !== 'object-list');

  async function unlink() {
    await api.del(`/edges/${edge.id}`);
    await qc.invalidateQueries({ queryKey: ['node'] });
    flash(`Unlinked ${other?.title ?? 'record'}`, {
      undo: async () => {
        await api.post(`/edges/${edge.id}/restore`);
        await qc.invalidateQueries({ queryKey: ['node'] });
      },
    });
  }

  async function saveProps() {
    await api.patch(`/edges/${edge.id}`, { props: { ...edge.props, ...draft } });
    await qc.invalidateQueries({ queryKey: ['node'] });
    setPropsOpen(false);
    flash('Connection updated');
  }

  return (
    <div className="row edge-row" style={{ padding: '6px 8px' }} data-selected={selected || undefined}>
      {onToggleSelect && (
        <SelectCheckbox
          checked={!!selected}
          label={`Select connection to ${other?.title ?? 'record'}`}
          onToggle={onToggleSelect}
        />
      )}
      <Chip tone="accent" mono>
        {label}
      </Chip>
      {other && <EntityGlyph type={other.type} size="sm" />}
      <Link
        to={other ? entityHref(other.type, otherId) : `/n/${otherId}`}
        className="row__main"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <div className="row__title">{other?.title ?? otherId.slice(0, 8)}</div>
      </Link>
      <span className="edge-row__actions">
        {editableFields.length > 0 && (
          <Popover
            open={propsOpen}
            onOpenChange={(o) => {
              setPropsOpen(o);
              if (o) setDraft(edge.props);
            }}
            trigger={
              <button type="button" className="edge-row__act" aria-label={`Edit ${label} properties`}>
                <Glyph name="edit" size={12} />
              </button>
            }
          >
            <div className="edge-props-form">
              {editableFields.map((f) => (
                <Field key={f.key} label={f.label}>
                  <InlinePropInput
                    field={f}
                    ownerType={edge.type}
                    value={draft[f.key]}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                  />
                </Field>
              ))}
              <Button size="sm" variant="primary" onClick={() => void saveProps()}>
                Save
              </Button>
            </div>
          </Popover>
        )}
        <button
          type="button"
          className="edge-row__act edge-row__act--danger"
          aria-label={`Unlink ${other?.title ?? 'record'}`}
          onClick={() => setConfirmUnlink(true)}
        >
          <Glyph name="close" size={12} />
        </button>
      </span>
      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title={`Unlink ${other?.title ?? 'this record'}?`}
        body={`Removes the “${label}” relationship. The records themselves are untouched, and Undo is available after.`}
        confirmLabel="Unlink"
        destructive
        onConfirm={() => {
          setConfirmUnlink(false);
          void unlink();
        }}
      />
    </div>
  );
}
