/**
 * Shared connection row: human edge label, neighbor link, edit props, unlink.
 * Used by Record and Person CRM Connections panels.
 *
 * Both of its writes used to be bare `async function`s fired as `void fn()`.
 * That put them outside `useMutation`, which is the only thing the app's global
 * `MutationCache.onError` net can see, so a failed DELETE /edges/:id and a
 * failed PATCH each did precisely nothing: no toast, no in-place message, the
 * confirm dialog already closed by the click handler and the row still there.
 * The only signal a person got was to try again. Both are mutations now, the
 * dialog closes on success rather than on click, the confirm and Save buttons
 * report that they are working, and each failure is stated where the action was
 * taken so the retry is in front of you.
 *
 * The row itself is `Row`. Its actions used to live in an `.edge-row__actions`
 * span that CSS held at `display: none` until hover or focus-within, so on a
 * touch screen the unlink control could not be reached at all, and on a mouse
 * every row reflowed as the pointer crossed it. `Row` keeps actions in flow.
 */
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ConfirmDialog,
  EntityGlyph,
  Field,
  Inline,
  Modal,
  Row,
  StatusTrace,
} from '@vitae/ui';
import {
  EDGE_FORM_DESCRIPTORS,
  edgeDisplayLabel,
  edgePropsSchemaFor,
  isEdgeType,
} from '@vitae/core';
import { api } from '../../lib/api.js';
import { entityHref } from '../../lib/entity-href.js';
import { useToast } from '../Toast.js';
import { InlinePropInput } from './EdgeSubEditorRow.js';
import { SelectCheckbox } from '../BulkNodeDelete.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';
import { refreshConnections } from '../../lib/refresh-connections.js';

export interface ConnectionEdge {
  id: string;
  type: string;
  src: string;
  dst: string;
  props: Record<string, unknown>;
}

/** The server's words when it gave any, ours when it did not. */
function reason(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function ConnectionRow({
  edge,
  nodeId,
  neighbors,
  selected,
  onToggleSelect,
  busy = false,
  as = 'div',
}: {
  edge: ConnectionEdge;
  nodeId: string;
  neighbors: Record<string, { id: string; type: string; title: string }>;
  selected?: boolean;
  onToggleSelect?: () => void;
  busy?: boolean;
  /** Pass `li` when the caller wraps the connections in a real `ul`. */
  as?: 'div' | 'li';
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const canWrite = useCanWrite();
  const flight = useRef(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(edge.props);
  const [initial, setInitial] = useState<Record<string, unknown>>(edge.props);
  const [validation, setValidation] = useState<string | null>(null);
  const ids = useId();

  const otherId = edge.src === nodeId ? edge.dst : edge.src;
  const other = neighbors[otherId];
  const otherTitle = other?.title ?? 'record';
  const direction = edge.src === nodeId ? 'out' : 'in';
  const label = edgeDisplayLabel(edge.type, direction, {
    relation: typeof edge.props.relation === 'string' ? edge.props.relation : undefined,
    kind: typeof edge.props.kind === 'string' ? edge.props.kind : undefined,
  });
  const descriptor = isEdgeType(edge.type) ? EDGE_FORM_DESCRIPTORS[edge.type] : undefined;
  const editableFields = (descriptor?.fields ?? []).filter((f) => f.widget !== 'object-list');
  const formTitleId = `${ids}-props-title`;
  const ownProps = (props: Record<string, unknown>) =>
    Object.fromEntries(editableFields.map((field) => [field.key, props[field.key]]));
  const dirty = propsOpen && JSON.stringify(ownProps(initial)) !== JSON.stringify(ownProps(draft));
  const conflict =
    propsOpen && JSON.stringify(ownProps(initial)) !== JSON.stringify(ownProps(edge.props));

  // No local onError on either: the query client's MutationCache already
  // announces every failure once, and a second flash here would say the same
  // sentence twice. What is missing without these is the message in place,
  // beside the control that would retry, which is what isError renders below.
  const unlink = useMutation({
    mutationFn: () => api.del(`/edges/${edge.id}`),
    onSuccess: async () => {
      await refreshConnections(qc);
      setConfirmUnlink(false);
      flash(`Unlinked ${otherTitle}`, {
        undo: async () => {
          await api.post(`/edges/${edge.id}/restore`);
          await refreshConnections(qc);
        },
      });
    },
  });

  const saveProps = useMutation({
    mutationFn: (props: Record<string, unknown>) => api.patch(`/edges/${edge.id}`, { props }),
    onSuccess: async () => {
      await refreshConnections(qc);
      guard.forceClose();
      flash('Connection updated');
    },
  });
  const pending = saveProps.isPending || unlink.isPending || busy;
  const guard = useUnsavedChanges(dirty || saveProps.isPending, {
    onClose: () => setPropsOpen(false),
    busy: saveProps.isPending,
  });
  async function submit(kind: 'save' | 'unlink') {
    if (flight.current || pending || !canWrite) return;
    if (kind === 'save' && conflict) return;
    const props = {
      ...edge.props,
      ...ownProps(draft),
      ...(edge.type === 'KNOWS'
        ? { last_interaction_at: edge.props.last_interaction_at ?? undefined }
        : {}),
    };
    if (kind === 'save' && isEdgeType(edge.type)) {
      const parsed = edgePropsSchemaFor(edge.type).safeParse(props);
      if (!parsed.success) {
        setValidation(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(' · '),
        );
        return;
      }
    }
    setValidation(null);
    flight.current = true;
    try {
      if (kind === 'save') await saveProps.mutateAsync(props);
      else await unlink.mutateAsync();
    } catch {
      /* Mutation state retains the inline error. */
    } finally {
      flight.current = false;
    }
  }

  return (
    <Row
      as={as}
      className="edge-row"
      interactive
      selected={selected}
      leading={
        <Inline gap={2} align="center">
          {onToggleSelect && (
            <SelectCheckbox
              checked={!!selected}
              label={`Select connection to ${otherTitle}`}
              onToggle={onToggleSelect}
              disabled={pending || !canWrite}
            />
          )}
          <Chip tone="accent" mono>
            {label}
          </Chip>
          {other && <EntityGlyph type={other.type} size="sm" />}
        </Inline>
      }
      main={(p) => <Link to={other ? entityHref(other.type, otherId) : `/n/${otherId}`} {...p} />}
      title={other?.title ?? otherId.slice(0, 8)}
      actions={
        <>
          {editableFields.length > 0 && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                glyph="edit"
                aria-label={`Edit ${label} properties`}
                disabled={pending || !canWrite}
                onClick={() => {
                  setPropsOpen(true);
                  setDraft(edge.props);
                  setInitial(edge.props);
                  setValidation(null);
                  saveProps.reset();
                }}
              />
              <Modal
                open={propsOpen}
                onOpenChange={guard.onOpenChange}
                title={`Edit ${label} properties`}
                description={`Update the relationship with ${otherTitle}.`}
                size="sm"
                footer={
                  <>
                    <Button type="button" disabled={pending} onClick={guard.requestClose}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={pending || conflict || !canWrite}
                      onClick={() => void submit('save')}
                    >
                      {saveProps.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </>
                }
              >
                {/* The fields come from EdgeSubEditorRow, whose controls this
                  component cannot name, so the group carries the edge it
                  belongs to and the visible line is what names the group. */}
                <fieldset
                  className="edge-props-form"
                  aria-labelledby={formTitleId}
                  disabled={pending || !canWrite}
                  style={{ minWidth: 0, border: 0, padding: 0, margin: 0 }}
                >
                  <p id={formTitleId} className="text-xs text-ink-soft">
                    {label}: {otherTitle}
                  </p>
                  {!canWrite && <p role="status">{WRITE_LOCK_HINT} Your draft is still here.</p>}
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
                  {saveProps.isError && (
                    <StatusTrace
                      tone="danger"
                      label="Not saved"
                      detail={reason(saveProps.error, 'The connection is unchanged. Try again.')}
                    />
                  )}
                  {validation && (
                    <StatusTrace
                      tone="danger"
                      label="Check connection details"
                      detail={validation}
                    />
                  )}
                  {conflict && (
                    <StatusTrace
                      tone="warning"
                      label="Connection changed"
                      detail="Your draft is still here. Cancel and reopen to use the latest connection details."
                    />
                  )}
                </fieldset>
              </Modal>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            glyph="close"
            aria-label={`Unlink ${otherTitle}`}
            disabled={pending || !canWrite}
            title={canWrite ? undefined : WRITE_LOCK_HINT}
            onClick={() => {
              guard.attempt(() => {
                setPropsOpen(false);
                unlink.reset();
                setConfirmUnlink(true);
              });
            }}
          />
        </>
      }
    >
      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={(open) => {
          if (!unlink.isPending) setConfirmUnlink(open);
        }}
        title={`Unlink ${other?.title ?? 'this record'}?`}
        body={
          <>
            {`Removes the '${label}' relationship. The records themselves are untouched, and Undo is available after.`}
            {unlink.isError && (
              <StatusTrace
                className="mt-3"
                tone="danger"
                label="Not unlinked"
                detail={reason(unlink.error, `${otherTitle} is still connected. Try again.`)}
              />
            )}
          </>
        }
        confirmLabel={unlink.isPending ? 'Unlinking...' : 'Unlink'}
        destructive
        busy={unlink.isPending}
        initialFocus="cancel"
        onConfirm={() => void submit('unlink')}
      />
      {guard.prompt}
    </Row>
  );
}
