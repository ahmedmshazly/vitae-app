/**
 * Generic "Add connection" flow: edge-type picker filtered by src/dst
 * compatibility with the node in hand → entity picker for the other endpoint →
 * per-edge-type props mini-form → POST /edges. Relationships are records
 * (SRS §4.4), so creating one is a first-class, typed act.
 *
 * A failed POST used to say the same sentence twice and in the wrong place:
 * the local onError flashed on the neutral channel while the query client's
 * MutationCache flashed the same message as an error, both of them behind the
 * dialog the user is still looking at. There is one report now, in the dialog,
 * directly above the button that retries it.
 *
 * The Relationship select carries its own label. A `<label for>` does not name
 * a Radix `<button role="combobox">`, so the field's visible name was reaching
 * nobody and the control announced only whichever value was showing.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  EntityGlyph,
  Field,
  Modal,
  Select,
  Stack,
  StatusTrace,
} from '@vitae/ui';
import {
  connectionOptionSelectLabel,
  connectionOptionsFor,
  edgePropsSchemaFor,
  isNodeType,
  type NodeType,
} from '@vitae/core';
import { api } from '../../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';
import { refreshConnections } from '../../lib/refresh-connections.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { useToast } from '../Toast.js';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { InlinePropInput } from './EdgeSubEditorRow.js';
import { NodeFormDialog } from './NodeFormDialog.js';
import type { ConnectionEdge } from './ConnectionRow.js';

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
  const [validation, setValidation] = useState<string | null>(null);
  const [creatingTarget, setCreatingTarget] = useState(false);
  const [savedTargetId, setSavedTargetId] = useState<string | null>(null);
  const [targetReadFailed, setTargetReadFailed] = useState(false);
  const targetReadInFlight = useRef(false);
  const [newTarget, setNewTarget] = useState<{ type: NodeType; title: string } | null>(null);
  const [createdConnection, setCreatedConnection] = useState<ConnectionEdge | null>(null);
  const contextSubject = useMemo(
    () => (nodeType === 'person' ? { id: nodeId, title: nodeTitle } : undefined),
    [nodeType, nodeId, nodeTitle],
  );
  const inFlight = useRef(false);
  const canWrite = useCanWrite();

  const options = useMemo(() => {
    if (!isNodeType(nodeType)) return [];
    return connectionOptionsFor(nodeType as NodeType);
  }, [nodeType]);

  const selected = options.find((o) => o.key === optionKey);

  const create = useMutation({
    mutationFn: () => {
      if (!selected || !target) throw new Error('incomplete');
      if (createdConnection)
        return api.patch<{ edge: { id: string } }>(`/edges/${createdConnection.id}`, {
          props: { ...createdConnection.props, ...props },
        });
      const src = selected.direction === 'out' ? nodeId : target.id;
      const dst = selected.direction === 'out' ? target.id : nodeId;
      return api.post<{ edge: { id: string } }>('/edges', {
        type: selected.descriptor.type,
        src,
        dst,
        props,
      });
    },
    onSuccess: async (res) => {
      await refreshConnections(qc);
      const edgeId = res.edge.id;
      // KNOWS is an upsert. The response does not distinguish creation from
      // updating an existing pair, so deleting it as Undo could erase history.
      flash(
        `Linked ${target?.title}`,
        selected?.descriptor.type === 'KNOWS' || createdConnection
          ? undefined
          : {
              undo: async () => {
                await api.del(`/edges/${edgeId}`);
                await refreshConnections(qc);
              },
            },
      );
      guard.forceClose();
    },
    onSettled: () => {
      inFlight.current = false;
    },
    // The complete recovery message is in the dialog; a global toast would
    // repeat it and cover the footer on short screens.
    onError: () => {},
  });

  const busy = create.isPending || creatingTarget;
  const awaitingSavedTarget = Boolean(savedTargetId && !target);
  const guard = useUnsavedChanges(open && !newTarget && (Boolean(optionKey) || busy), {
    busy,
    body: createdConnection
      ? 'The record and its connection are already saved. Discarding leaves them in place and only drops these additional edits.'
      : savedTargetId
        ? 'The new record is already saved. Leaving keeps it and any connections saved with it; only this unfinished connection draft is discarded.'
        : undefined,
    onClose: () => {
      reset();
      onOpenChange(false);
    },
  });

  function submit() {
    if (!selected || !target || awaitingSavedTarget || inFlight.current || busy || !canWrite)
      return;
    const parsed = edgePropsSchemaFor(selected.descriptor.type).safeParse(props);
    if (!parsed.success) {
      setValidation(
        parsed.error.issues
          .map(
            (issue) =>
              `${selected.descriptor.fields.find((field) => field.key === issue.path[0])?.label ?? 'Connection'}: ${issue.message}`,
          )
          .join('. '),
      );
      return;
    }
    setValidation(null);
    inFlight.current = true;
    // Validate without sending schema defaults: omitted favors/topics on a
    // KNOWS upsert must not replace the relationship's existing values.
    create.mutate();
  }

  function reset() {
    setOptionKey(undefined);
    setTarget(null);
    setCreatedConnection(null);
    setSavedTargetId(null);
    setTargetReadFailed(false);
    setProps({});
    setValidation(null);
    create.reset();
  }

  function close() {
    if (!busy) guard.requestClose();
  }

  async function loadSavedTarget(savedId: string) {
    if (targetReadInFlight.current) return;
    targetReadInFlight.current = true;
    setCreatingTarget(true);
    setTargetReadFailed(false);
    try {
      const { node, edges } = await api.get<{ node: PickedEntity; edges: ConnectionEdge[] }>(
        `/nodes/${savedId}`,
      );
      const src = selected?.direction === 'out' ? nodeId : node.id;
      const dst = selected?.direction === 'out' ? node.id : nodeId;
      setCreatedConnection(
        edges.find(
          (edge) => edge.type === selected?.descriptor.type && edge.src === src && edge.dst === dst,
        ) ?? null,
      );
      setTarget({ id: node.id, title: node.title, type: node.type });
      setValidation(null);
    } catch {
      setTargetReadFailed(true);
    } finally {
      targetReadInFlight.current = false;
      setCreatingTarget(false);
    }
  }

  return (
    <>
      <Modal
        open={open && !newTarget}
        onOpenChange={(o) => {
          if (!o) close();
          else onOpenChange(true);
        }}
        title="Add connection"
        description={`Link '${nodeTitle}' to another record with a typed relationship.`}
        footer={
          <>
            <Button type="button" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={!selected || !target || busy || !canWrite}
              onClick={submit}
            >
              {create.isPending
                ? 'Linking...'
                : createdConnection
                  ? 'Finish connection'
                  : 'Create link'}
            </Button>
          </>
        }
      >
        <fieldset
          className="add-connection-fields"
          disabled={busy || awaitingSavedTarget || !canWrite}
        >
          <legend className="u-visually-hidden">Connection details</legend>
          <Stack gap={4}>
            <Field label="Relationship" help={selected?.descriptor.description}>
              <Select
                label={`Relationship: ${selected ? connectionOptionSelectLabel(selected) : 'not chosen'}`}
                value={optionKey}
                onChange={(v) => {
                  // A server refusal describes the previous endpoints. Once the
                  // relationship is corrected it is no longer actionable.
                  if (v === optionKey || busy || awaitingSavedTarget) return;
                  const change = () => {
                    create.reset();
                    setValidation(null);
                    setOptionKey(v);
                    setTarget(null);
                    setCreatedConnection(null);
                    setSavedTargetId(null);
                    setProps({});
                  };
                  if (target || Object.keys(props).length) guard.attempt(change);
                  else change();
                }}
                options={options.map((o) => ({
                  value: o.key,
                  label: connectionOptionSelectLabel(o),
                }))}
                placeholder="Choose how they relate..."
                clearable={false}
              />
            </Field>

            {selected && !target && !awaitingSavedTarget && (
              // The htmlFor that used to be here pointed at an id nothing renders:
              // EntityPicker takes no id and names its own input from its
              // placeholder. Until it accepts a name, the group is what carries
              // which end of the relationship this picker is filling in.
              <Field label={selected.direction === 'out' ? 'To' : 'From'}>
                <div role="group" aria-label={selected.direction === 'out' ? 'To' : 'From'}>
                  <EntityPicker
                    key={selected.targetTypes.join(',')}
                    types={selected.targetTypes}
                    excludeIds={[nodeId, ...excludeIds]}
                    onPick={(next) => {
                      create.reset();
                      setCreatedConnection(null);
                      setSavedTargetId(null);
                      setTarget(next);
                    }}
                    autoFocus
                    onCreate={(type, title) => setNewTarget({ type, title })}
                  />
                </div>
              </Field>
            )}

            {target && (
              <div className="edgesub__row add-connection-target">
                <EntityGlyph type={target.type} size="sm" />
                <span className="edgesub__title">{target.title}</span>
                <Chip mono>{target.type}</Chip>
                <button
                  type="button"
                  className="vt-strlist__x"
                  aria-label="Clear target"
                  onClick={() => {
                    create.reset();
                    setTarget(null);
                    setCreatedConnection(null);
                    setSavedTargetId(null);
                  }}
                >
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
                        onChange={(v) => {
                          create.reset();
                          setProps((p) => ({ ...p, [f.key]: v }));
                        }}
                      />
                    </Field>
                  ))}
              </div>
            )}

            {selected?.descriptor.type === 'KNOWS' && (
              <p className="text-sm text-muted">
                People have one relationship per pair. Saving updates it if they are already
                connected; existing history and favors are kept.
              </p>
            )}
            {validation && (
              <StatusTrace tone="danger" label="Check connection details" detail={validation} />
            )}
            {createdConnection && (
              <p role="status">
                The record and its connection are saved. Finish to keep them, or review the
                relationship details first.
              </p>
            )}
            {!canWrite && <p className="text-sm text-muted">{WRITE_LOCK_HINT}</p>}
            {create.isError && (
              <StatusTrace
                tone="danger"
                label="Link not confirmed"
                detail={
                  create.error instanceof Error && create.error.message
                    ? create.error.message
                    : 'We couldn’t confirm the link. Your draft is still here.'
                }
              />
            )}
            {create.isError && (
              <p className="text-sm text-muted">
                Check the connections before retrying: the first request may have succeeded despite
                the missing response.
              </p>
            )}
          </Stack>
        </fieldset>
        {creatingTarget && <p role="status">Record saved. Loading its connection details…</p>}
        {targetReadFailed && savedTargetId && (
          <Banner
            className="network-secondary-state"
            tone="danger"
            title="Record saved · details unavailable"
            action={
              <Button type="button" onClick={() => void loadSavedTarget(savedTargetId)}>
                Retry loading record
              </Button>
            }
          >
            Retry loading this record to check its saved connections. This will not create another
            record or link.
          </Banner>
        )}
      </Modal>
      {newTarget && (
        <NodeFormDialog
          open
          type={newTarget.type}
          seed={{ title: newTarget.title }}
          subject={contextSubject}
          notifyOnSave={false}
          onOpenChange={(next) => {
            if (!next) setNewTarget(null);
          }}
          onSaved={(savedId) => {
            setSavedTargetId(savedId);
            setNewTarget(null);
            void loadSavedTarget(savedId);
          }}
        />
      )}
      {guard.prompt}
    </>
  );
}
