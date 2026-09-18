/**
 * Create/edit dialog around EntityForm. Create commits the node then its
 * sub-editor edges; edit PATCHes the node and diffs edges (added → POST,
 * removed → DELETE, changed inline props → PATCH). Every save lands a toast;
 * creates carry an Undo (soft-delete compensating call).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Glyph, Modal, Skeleton, Spinner } from '@vitae/ui';
import {
  isApplicationStatus,
  NODE_FORM_DESCRIPTORS,
  nodeFormDescriptor,
  subjectSubEditor,
  type NodeType,
} from '@vitae/core';
import { api } from '../../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';
import { useToast } from '../Toast.js';
import { EntityForm, type EntityFormSubmit, type EntityFormValues } from './EntityForm.js';
import { newDraftKey, type ConnectionDraft } from './EdgeSubEditorRow.js';
import { additionalConnectionSub, connectionOptionsFor } from './ConnectionComposer.js';
import { entityHref } from '../../lib/entity-href.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { saveConnections } from './save-connections.js';

interface NodeResp {
  node: {
    id: string;
    type: NodeType;
    title: string;
    subtitle?: string;
    notes_md: string;
    start_date?: string;
    end_date?: string;
    date_precision?: 'day' | 'month' | 'year';
    props: Record<string, unknown>;
  };
  edges: Array<{
    id: string;
    type: string;
    src: string;
    dst: string;
    props: Record<string, unknown>;
  }>;
  neighbors: Record<string, { id: string; type: string; title: string }>;
}

interface DuplicateCandidate {
  id: string;
  type: NodeType;
  title: string;
  meta: string;
  score: number;
  verdict: 'possible' | 'probable';
  evidence: string[];
  contradictions: Array<{ label: string }>;
}

interface DuplicateCheck {
  fingerprint: string;
  candidates: DuplicateCandidate[];
}

function typeLabel(type: NodeType): string {
  return type.replace(/_/g, ' ');
}

export function NodeFormDialog({
  open,
  onOpenChange,
  type,
  nodeId,
  seed,
  onSaved,
  returnFocusRef,
  subject,
  notifyOnSave = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: NodeType;
  /** Present = edit mode. */
  nodeId?: string;
  /** Prefill for create mode (e.g. from the ⌘K parse). */
  seed?: Partial<EntityFormValues>;
  onSaved?: (nodeId: string) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Contextual person for a new record; never changes an existing record. */
  subject?: { id: string; title: string };
  /** A containing workflow may own save feedback instead of a global toast. */
  notifyOnSave?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [savedNodeId, setSavedNodeId] = useState(nodeId);
  const committedConnections = useRef<Map<string, ConnectionDraft> | null>(null);
  const [dirty, setDirty] = useState(Boolean(seed));
  const guard = useUnsavedChanges(open && (dirty || Boolean(seed)), {
    onClose: () => onOpenChange(false),
    busy,
    body:
      savedNodeId && !nodeId
        ? 'The record is already saved, but some connections may be unfinished. Leaving discards your remaining changes; it does not delete the saved record.'
        : undefined,
  });
  const [draft, setDraft] = useState<EntityFormValues | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheck | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<EntityFormSubmit | null>(null);
  const [approvedFingerprint, setApprovedFingerprint] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // A failed submission may leave the user at the bottom of a long form.
    // Move focus to the recovery message without discarding their draft.
    if (saveError) saveErrorRef.current?.focus();
  }, [saveError]);
  // The actions live in the modal's sticky footer, so they need to reach the
  // form across the DOM, that is what the `form` attribute is for.
  const formId = useId();

  const existing = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => api.get<NodeResp>(`/nodes/${nodeId}`),
    enabled: open && Boolean(nodeId),
  });

  // Create may record any status (a past rejection is a fact). Edit offers
  // only the moves the server would accept; correction lives on the dossier.
  const descriptor = useMemo(() => {
    if (type === 'application' && nodeId) {
      const status = existing.data?.node.props.status;
      if (isApplicationStatus(status))
        return nodeFormDescriptor('application', { applicationStatus: status });
    }
    if (type === 'person' && existing.data?.node.props.year_known === false) {
      const person = NODE_FORM_DESCRIPTORS.person;
      return {
        ...person,
        fields: person.fields.map((field) =>
          field.key === 'birthday'
            ? {
                ...field,
                help: 'Birth year is not recorded. The year shown is a storage placeholder; saving preserves that unknown-year status.',
              }
            : field,
        ),
      };
    }
    return NODE_FORM_DESCRIPTORS[type];
  }, [type, nodeId, existing.data]);

  /** Existing edges that belong to a sub-editor become editable drafts. */
  const initialConnections = useMemo<ConnectionDraft[]>(() => {
    if (!nodeId) {
      const sub = subjectSubEditor(type);
      return subject && sub?.targetTypes.includes('person')
        ? [
            {
              key: `subject-${subject.id}`,
              sub,
              target: { ...subject, type: 'person' },
              props: {},
            },
          ]
        : [];
    }
    if (!existing.data) return [];
    const { node, edges, neighbors } = existing.data;
    const drafts: ConnectionDraft[] = [];
    // The subject goes first so that where it shares an edge type with a
    // sub-editor (AUTHORED: the author vs. the co-authors), the first matching
    // edge is claimed as the subject and the rest fall through to the list.
    const subjectSub = subjectSubEditor(type);
    for (const sub of subjectSub ? [subjectSub, ...descriptor.edges] : descriptor.edges) {
      for (const e of edges) {
        if (e.type !== sub.edgeType) continue;
        const isOut = e.src === node.id;
        if ((sub.direction === 'out') !== isOut) continue;
        const otherId = isOut ? e.dst : e.src;
        const other = neighbors[otherId];
        if (!other || !(sub.targetTypes as string[]).includes(other.type)) continue;
        if (drafts.some((d) => d.edgeId === e.id)) continue;
        drafts.push({
          key: newDraftKey(),
          sub,
          target: other,
          props: { ...e.props },
          edgeId: e.id,
        });
      }
    }

    // Curated rows are shortcuts, not a visibility boundary. Load every other
    // legal edge into the universal composer so editing a record never hides a
    // relationship that was imported or created from the record page.
    const options = connectionOptionsFor(type);
    for (const edge of edges) {
      if (drafts.some((draft) => draft.edgeId === edge.id)) continue;
      const direction = edge.src === node.id ? 'out' : 'in';
      const otherId = direction === 'out' ? edge.dst : edge.src;
      const other = neighbors[otherId];
      if (!other) continue;
      const option = options.find(
        (candidate) =>
          candidate.descriptor.type === edge.type &&
          candidate.direction === direction &&
          (candidate.targetTypes as readonly string[]).includes(other.type),
      );
      if (!option) continue;
      drafts.push({
        key: newDraftKey(),
        kind: 'additional',
        sub: additionalConnectionSub(option),
        target: other,
        props: { ...edge.props },
        edgeId: edge.id,
      });
    }
    return drafts;
  }, [nodeId, existing.data, descriptor, type, subject]);

  const defaultValues = useMemo<Partial<EntityFormValues> | undefined>(() => {
    if (nodeId) {
      const n = existing.data?.node;
      if (!n) return undefined;
      return {
        title: n.title,
        subtitle: n.subtitle ?? '',
        notes_md: n.notes_md ?? '',
        start_date: n.start_date,
        end_date: n.end_date,
        date_precision: n.date_precision,
        props: n.props ?? {},
      };
    }
    return seed;
  }, [nodeId, existing.data, seed]);

  useEffect(() => {
    if (!open || !draft?.title || draft.title.trim().length < 2) {
      setDuplicateCheck(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCheckingDuplicates(true);
      void api
        .post<DuplicateCheck>('/duplicates/check', {
          draft: { type, ...draft },
          ...(nodeId ? { excludeId: nodeId } : {}),
          limit: 5,
        })
        .then((result) => {
          if (!cancelled) setDuplicateCheck(result);
        })
        .catch(() => {
          // Duplicate hints are advisory. A failed check must not block the
          // form or escape as an unhandled rejection; the server still owns
          // validation when the record is committed.
          if (!cancelled) setDuplicateCheck(null);
        })
        .finally(() => {
          if (!cancelled) setCheckingDuplicates(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, nodeId, open, type]);

  const handleValuesChange = useCallback((values: EntityFormValues) => {
    setDraft(values);
    setPendingSubmit(null);
    // A save failure describes the submitted draft. Once the person changes
    // that draft it is no longer current; keeping the old failure visible
    // makes it look as though the new value has already been rejected.
    setSaveError(null);
  }, []);

  async function commitSubmit({ values, connections }: EntityFormSubmit) {
    if (saving.current || !canWrite) return;
    saving.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      let id = savedNodeId;
      if (id) {
        await api.patch(`/nodes/${id}`, values);
      } else {
        const res = await api.post<{ node: { id: string } }>('/nodes', {
          type,
          ...values,
          ...(descriptor.envelope.sensitivityDefault
            ? { sensitivity: descriptor.envelope.sensitivityDefault }
            : {}),
        });
        id = res.node.id;
        setSavedNodeId(id);
      }
      committedConnections.current ??= new Map(
        initialConnections.filter((draft) => draft.edgeId).map((draft) => [draft.edgeId!, draft]),
      );
      await saveConnections(id, connections, committedConnections.current);
      await qc.invalidateQueries();
      if (nodeId) {
        if (notifyOnSave) toast.flash(`Updated ${values.title}`);
        guard.forceClose();
        onSaved?.(id);
      } else {
        if (notifyOnSave)
          toast.flash(`Created ${values.title}`, {
            undo: async () => {
              await api.del(`/nodes/${id}`);
              await qc.invalidateQueries();
            },
          });
        guard.forceClose();
        if (onSaved) onSaved(id);
        else navigate(entityHref(type, id));
      }
    } catch (err) {
      // There was no catch here at all: a failed save threw past try/finally as
      // an unhandled rejection, the dialog sat there looking idle, and every
      // value the user had typed was still on screen with nothing to explain
      // why nothing happened.
      setSaveError(err instanceof Error ? err.message : 'The record could not be saved.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function handleSubmit(submission: EntityFormSubmit) {
    const requiresReview =
      !savedNodeId &&
      duplicateCheck &&
      duplicateCheck.candidates.length > 0 &&
      approvedFingerprint !== duplicateCheck.fingerprint;
    if (requiresReview) {
      setPendingSubmit(submission);
      return;
    }
    await commitSubmit(submission);
  }

  const loadingEdit = Boolean(nodeId) && existing.isPending;
  const failedEdit = Boolean(nodeId) && existing.isError && !existing.data;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!saving.current) guard.onOpenChange(next);
        }}
        title={nodeId ? `Edit ${typeLabel(type)}` : `New ${typeLabel(type)}`}
        size="lg"
        returnFocusRef={returnFocusRef}
        footer={
          loadingEdit || failedEdit ? undefined : (
            <>
              {!canWrite && <span className="mr-auto text-sm text-muted">{WRITE_LOCK_HINT}</span>}
              <Button type="button" onClick={guard.requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="primary"
                disabled={busy || !canWrite}
                title={canWrite ? undefined : WRITE_LOCK_HINT}
              >
                {busy ? 'Saving...' : nodeId ? 'Save changes' : `Create ${typeLabel(type)}`}
              </Button>
            </>
          )
        }
      >
        {failedEdit ? (
          <div className="entity-form-load-error" role="alert">
            <Glyph name="alert" size={18} />
            <div>
              <strong>Couldn't load this record.</strong>
              <p>
                {existing.error instanceof Error
                  ? existing.error.message
                  : 'The record is unavailable right now.'}
              </p>
              <Button size="sm" onClick={() => void existing.refetch()}>
                Retry
              </Button>
            </div>
          </div>
        ) : loadingEdit ? (
          // Skeletons in the shape of what is coming, same field grid, same row
          // heights, rather than a centred spinner on a full panel.
          <div className="entity-form" role="status" aria-label="Loading record">
            <div className="entity-form__grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton height={11} width="35%" />
                  <Skeleton height={32} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {saveError && (
              <p
                ref={saveErrorRef}
                tabIndex={-1}
                role="alert"
                className="mb-4 flex items-start gap-2 text-sm text-danger"
              >
                <Glyph name="close" size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="font-semibold">Couldn't save.</strong> {saveError}{' '}
                  {savedNodeId
                    ? 'Some changes may already be saved. Retry to finish this same record. Your draft is still here.'
                    : 'Your draft is still here. Try saving again.'}
                </span>
              </p>
            )}
            {duplicateCheck?.candidates.length ? (
              <div
                className={`dedup-live${pendingSubmit ? ' dedup-live--checkpoint' : ''}`}
                aria-live="polite"
              >
                <div className="spread">
                  <div>
                    <strong>
                      {pendingSubmit ? 'Review before creating' : 'Possible existing records'}
                    </strong>
                    <div className="u-muted" style={{ fontSize: 'var(--ae-text-xs)' }}>
                      Vitae found {duplicateCheck.candidates.length} same-type candidate
                      {duplicateCheck.candidates.length === 1 ? '' : 's'}.
                    </div>
                  </div>
                  {checkingDuplicates ? <Spinner /> : null}
                </div>
                <div className="dedup-live__list">
                  {duplicateCheck.candidates.map((candidate) => (
                    <div key={candidate.id} className="dedup-live__candidate">
                      <div className="row__main">
                        <div className="row__title">{candidate.title}</div>
                        <div className="row__sub">
                          {candidate.verdict} · {candidate.score.toFixed(0)}% ·{' '}
                          {candidate.evidence.join(' · ')}
                        </div>
                        {candidate.contradictions.length ? (
                          <div className="dedup-live__warning">
                            {candidate.contradictions.map((item) => item.label).join(' · ')}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          guard.attempt(() => {
                            onOpenChange(false);
                            if (onSaved) onSaved(candidate.id);
                            else navigate(entityHref(candidate.type, candidate.id));
                          })
                        }
                      >
                        Use existing
                      </Button>
                    </div>
                  ))}
                </div>
                {pendingSubmit ? (
                  <div className="dedup-live__actions">
                    <Button disabled={busy} onClick={() => setPendingSubmit(null)}>
                      Keep editing
                    </Button>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => {
                        setApprovedFingerprint(duplicateCheck.fingerprint);
                        const submission = pendingSubmit;
                        setPendingSubmit(null);
                        void commitSubmit(submission);
                      }}
                    >
                      Create separately
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : checkingDuplicates ? (
              <div className="dedup-live dedup-live--quiet">
                <Spinner /> Checking for existing records...
              </div>
            ) : null}
            <EntityForm
              key={nodeId ?? 'create'}
              type={type}
              descriptor={descriptor}
              defaultValues={defaultValues}
              initialConnections={initialConnections}
              formId={formId}
              busy={busy}
              onSubmit={handleSubmit}
              onValuesChange={handleValuesChange}
              onDirtyChange={setDirty}
            />
          </>
        )}
      </Modal>
      {guard.prompt}
    </>
  );
}
