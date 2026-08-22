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
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  ConfirmDialog,
  EntityGlyph,
  Field,
  Inline,
  Popover,
  Row,
  StatusTrace,
} from '@vitae/ui';
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
  as = 'div',
}: {
  edge: ConnectionEdge;
  nodeId: string;
  neighbors: Record<string, { id: string; type: string; title: string }>;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Pass `li` when the caller wraps the connections in a real `ul`. */
  as?: 'div' | 'li';
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(edge.props);
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

  // No local onError on either: the query client's MutationCache already
  // announces every failure once, and a second flash here would say the same
  // sentence twice. What is missing without these is the message in place,
  // beside the control that would retry, which is what isError renders below.
  const unlink = useMutation({
    mutationFn: () => api.del(`/edges/${edge.id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['node'] });
      setConfirmUnlink(false);
      flash(`Unlinked ${otherTitle}`, {
        undo: async () => {
          await api.post(`/edges/${edge.id}/restore`);
          await qc.invalidateQueries({ queryKey: ['node'] });
        },
      });
    },
  });

  const saveProps = useMutation({
    mutationFn: () => api.patch(`/edges/${edge.id}`, { props: { ...edge.props, ...draft } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['node'] });
      setPropsOpen(false);
      flash('Connection updated');
    },
  });

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
            <Popover
              open={propsOpen}
              onOpenChange={(o) => {
                setPropsOpen(o);
                if (o) {
                  setDraft(edge.props);
                  saveProps.reset();
                }
              }}
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  glyph="edit"
                  aria-label={`Edit ${label} properties`}
                />
              }
            >
              {/* The fields come from EdgeSubEditorRow, whose controls this
                  component cannot name, so the group carries the edge it
                  belongs to and the visible line is what names the group. */}
              <div className="edge-props-form" role="group" aria-labelledby={formTitleId}>
                <p id={formTitleId} className="text-xs text-ink-soft">
                  {label}: {otherTitle}
                </p>
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
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={saveProps.isPending}
                  onClick={() => saveProps.mutate()}
                >
                  {saveProps.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </Popover>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            glyph="close"
            aria-label={`Unlink ${otherTitle}`}
            onClick={() => {
              unlink.reset();
              setConfirmUnlink(true);
            }}
          />
        </>
      }
    >
      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title={`Unlink ${other?.title ?? 'this record'}?`}
        body={
          <>
            {`Removes the “${label}” relationship. The records themselves are untouched, and Undo is available after.`}
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
        confirmLabel={unlink.isPending ? 'Unlinking…' : 'Unlink'}
        destructive
        busy={unlink.isPending}
        onConfirm={() => unlink.mutate()}
      />
    </Row>
  );
}
