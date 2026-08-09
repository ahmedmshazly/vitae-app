/**
 * Generic "Add connection" flow: edge-type picker filtered by src/dst
 * compatibility with the node in hand → entity picker for the other endpoint →
 * per-edge-type props mini-form → POST /edges. Relationships are records
 * (SRS §4.4), so creating one is a first-class, typed act.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EntityGlyph, Field, Modal, Select } from '@vitae/ui';
import {
  connectionOptionSelectLabel,
  connectionOptionsFor,
  isNodeType,
  type NodeType,
} from '@vitae/core';
import { api } from '../../lib/api.js';
import { useToast } from '../Toast.js';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { InlinePropInput } from './EdgeSubEditorRow.js';

export function AddConnection({
  open,
  onOpenChange,
  nodeId,
  nodeType,
  nodeTitle,
  excludeIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  excludeIds?: string[];
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const [optionKey, setOptionKey] = useState<string | undefined>();
  const [target, setTarget] = useState<PickedEntity | null>(null);
  const [props, setProps] = useState<Record<string, unknown>>({});

  const options = useMemo(() => {
    if (!isNodeType(nodeType)) return [];
    return connectionOptionsFor(nodeType as NodeType);
  }, [nodeType]);

  const selected = options.find((o) => o.key === optionKey);

  const create = useMutation({
    mutationFn: () => {
      if (!selected || !target) throw new Error('incomplete');
      const src = selected.direction === 'out' ? nodeId : target.id;
      const dst = selected.direction === 'out' ? target.id : nodeId;
      return api.post<{ edge: { id: string } }>('/edges', { type: selected.descriptor.type, src, dst, props });
    },
    onSuccess: async (res) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['node', nodeId] }),
        qc.invalidateQueries({ queryKey: ['org', nodeId] }),
        qc.invalidateQueries({ queryKey: ['people'] }),
        qc.invalidateQueries({ queryKey: ['person-summary'] }),
      ]);
      const edgeId = res.edge.id;
      flash(`Linked ${target?.title}`, {
        undo: async () => {
          await api.del(`/edges/${edgeId}`);
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['node', nodeId] }),
            qc.invalidateQueries({ queryKey: ['org', nodeId] }),
          ]);
        },
      });
      reset();
      onOpenChange(false);
    },
    onError: (err) => {
      flash((err as Error).message || 'Could not create link');
    },
  });

  function reset() {
    setOptionKey(undefined);
    setTarget(null);
    setProps({});
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Add connection"
      description={`Link “${nodeTitle}” to another record with a typed relationship.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selected || !target || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Linking…' : 'Create link'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 'var(--ae-space-4)' }}>
        <Field label="Relationship" htmlFor="ac-type" help={selected?.descriptor.description}>
          <Select
            id="ac-type"
            value={optionKey}
            onChange={(v) => {
              setOptionKey(v);
              setTarget(null);
              setProps({});
            }}
            options={options.map((o) => ({
              value: o.key,
              label: connectionOptionSelectLabel(o),
            }))}
            placeholder="Choose how they relate…"
            clearable={false}
          />
        </Field>

        {selected && !target && (
          <Field label={selected.direction === 'out' ? 'To' : 'From'} htmlFor="ac-target">
            <EntityPicker
              key={selected.targetTypes.join(',')}
              types={selected.targetTypes}
              excludeIds={[nodeId, ...excludeIds]}
              onPick={setTarget}
              autoFocus
            />
          </Field>
        )}

        {target && (
          <div className="edgesub__row">
            <EntityGlyph type={target.type} size="sm" />
            <span className="edgesub__title">{target.title}</span>
            <Chip mono>{target.type}</Chip>
            <button type="button" className="vt-strlist__x" aria-label="Clear target" onClick={() => setTarget(null)}>
              ×
            </button>
          </div>
        )}

        {selected && target && selected.descriptor.fields.length > 0 && (
          <div className="entity-form__grid">
            {selected.descriptor.fields
              .filter((f) => f.widget !== 'object-list')
              .map((f) => (
                <Field key={f.key} label={f.label} help={f.help}>
                  <InlinePropInput
                    field={f}
                    ownerType={selected.descriptor.type}
                    value={props[f.key]}
                    onChange={(v) => setProps((p) => ({ ...p, [f.key]: v }))}
                  />
                </Field>
              ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
