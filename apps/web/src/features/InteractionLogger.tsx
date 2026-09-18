import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Field, FilterGroup, Input, Modal, Stack, Textarea } from '@vitae/ui';
import { api, ApiError } from '../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
import { useToast } from './Toast.js';
import { useUnsavedChanges } from '../lib/unsaved-changes.js';

/**
 * The five kinds the ledger records, as plain words.
 *
 * Each used to carry a hard-coded character marker. Two of them, U+2615 and
 * U+2709, have emoji presentation by default on every major platform, so a
 * brown coffee cup and a blue envelope were the only saturated things on an
 * otherwise achromatic overlay.
 */
const KINDS = [
  { key: 'coffee', label: 'coffee' },
  { key: 'call', label: 'call' },
  { key: 'video', label: 'video' },
  { key: 'message', label: 'message' },
  { key: 'meeting', label: 'meeting' },
] as const;

type Kind = (typeof KINDS)[number]['key'];

/**
 * Direction is an operator-stated fact the correspondence figures build on.
 * Unstated is the default so the control never guesses (FR-COMM-001): capture
 * omits `initiated_by` the same way. Choosing me/them posts the field; leaving
 * it unstated omits it.
 */
const INITIATORS = [
  { key: 'unstated', label: 'unstated' },
  { key: 'me', label: 'I did' },
  { key: 'them', label: 'they did' },
] as const;

type Initiator = (typeof INITIATORS)[number]['key'];

interface LogResponse {
  interaction: { id: string };
  strength: { strength: number };
}

interface LogSubmission {
  personId: string;
  kind: Kind;
  note: string;
  occurredAt: string;
  followUpDate?: string;
  idempotencyKey: string;
  initiatedBy?: Exclude<Initiator, 'unstated'>;
}

/**
 * Interaction logger overlay (SRS P09, FR-CON-002/003). Logs the
 * interaction, recomputes strength server-side, and offers toast-undo.
 *
 * FR-022/FR-023: a real Modal (name, focus trap, Esc, focus restoration) and a
 * real label on every input.
 *
 * The save is a `useMutation` rather than a bare `async` function called as
 * `void save()`. That spelling had no catch, so a rejected POST became an
 * unhandled rejection: the button flipped back to "Save", the overlay stayed
 * open, and nothing anywhere said the interaction had not been recorded. The
 * mutation reports failures in the overlay. Unconfirmed saves retain their
 * exact request and idempotency key so retry can confirm the original write.
 *
 * The kind picker is `FilterGroup`, not five `vt-chip` buttons in a hand-built
 * `role="radiogroup"`. That group implemented none of the radio keyboard
 * contract, and its selected state was a border hue with no `aria-pressed`
 * behind it, so which kind was about to be written was carried by colour alone.
 */
export function InteractionLogger({
  personId,
  personName,
  onClose,
}: {
  personId: string;
  personName: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>('coffee');
  const [initiatedBy, setInitiatedBy] = useState<Initiator>('unstated');
  const [note, setNote] = useState('');
  const [followDue, setFollowDue] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());
  const saving = useRef(false);
  const [submitted, setSubmitted] = useState<LogSubmission | null>(null);
  const ids = useId();
  const qc = useQueryClient();
  const { flash } = useToast();
  const canWrite = useCanWrite();

  const log = useMutation({
    mutationFn: (submission: LogSubmission) => api.post<LogResponse>('/interactions', submission),
    onSuccess: async (res) => {
      await qc.invalidateQueries();
      guard.forceClose();
      flash(
        `Logged ${kind} with ${personName}.${followDue ? ' Follow-up reminder added. Undo removes only the interaction.' : ''}`,
        {
          undo: async () => {
            await api.del(`/interactions/${res.interaction.id}`);
            await qc.invalidateQueries();
          },
        },
      );
    },
    onError: (error) => {
      // A validation refusal happens before writes. A timeout or server error
      // may happen after commit, so keep that exact payload for its retry.
      if (error instanceof ApiError && (error.status === 400 || error.status === 422))
        setSubmitted(null);
    },
    onSettled: () => {
      saving.current = false;
    },
  });

  const uncertain = log.isError && submitted !== null;
  const dirty = Boolean(
    note.trim() || followDue || kind !== 'coffee' || initiatedBy !== 'unstated',
  );
  const guard = useUnsavedChanges(dirty, {
    onClose,
    busy: log.isPending,
    body: uncertain
      ? 'The save was not confirmed and may already exist. Leaving discards this local draft; it does not remove a saved interaction.'
      : undefined,
  });
  const canSave = canWrite && note.trim().length > 0 && !log.isPending;
  function save() {
    if (!canSave || saving.current) return;
    saving.current = true;
    const submission = submitted ?? {
      personId,
      kind,
      note: note.trim(),
      occurredAt: new Date().toISOString(),
      followUpDate: followDue || undefined,
      idempotencyKey: idempotencyKey.current,
      ...(initiatedBy !== 'unstated' ? { initiatedBy } : {}),
    };
    setSubmitted(submission);
    log.mutate(submission);
  }
  // A refusal describes the exact interaction that was submitted. As soon as
  // the operator changes that draft, it is a new attempt; retaining the old
  // banner would make the edited record look rejected before it is saved.
  const revise = (change: () => void) => {
    change();
    if (log.isError) log.reset();
  };

  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!log.isPending) guard.onOpenChange(open);
        }}
        title={`Log interaction · ${personName}`}
        description={`Keep a note about ${personName}, with an optional follow-up reminder.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={log.isPending} onClick={guard.requestClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canSave} type="submit" form={`${ids}-form`}>
              {log.isPending ? 'Saving…' : uncertain ? 'Retry save' : 'Save'}
            </Button>
          </>
        }
      >
        <Stack gap={4}>
          {log.isError && (
            <Banner
              tone="danger"
              title={uncertain ? 'Save not confirmed' : 'Check the interaction details'}
            >
              {log.error instanceof Error
                ? log.error.message
                : 'The interaction could not be saved.'}
              {uncertain && (
                <p className="mt-2">
                  Retry the same submission to confirm it without creating a duplicate. The
                  submitted details are kept unchanged until then.
                </p>
              )}
            </Banner>
          )}

          <form
            id={`${ids}-form`}
            className="interaction-logger"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <fieldset
              className="entity-form__fields"
              disabled={log.isPending || uncertain || !canWrite}
            >
              <Stack gap={4}>
                {!canWrite && (
                  <Banner tone="warning" title="This workspace is read-only">
                    {WRITE_LOCK_HINT}
                  </Banner>
                )}

                {/* The Field shell without a Field: FilterGroup names its own group, so
            a <label> here would point at nothing. Reusing the class keeps this
            label on the same rhythm as the two real fields below it. */}
                <div className="vt-fld">
                  <span className="vt-fld__label">Kind</span>
                  <FilterGroup
                    label="Kind"
                    options={KINDS}
                    value={kind}
                    onChange={(next) => revise(() => setKind(next))}
                  />
                </div>

                <div className="vt-fld">
                  <span className="vt-fld__label">Who reached out</span>
                  <FilterGroup
                    label="Who reached out"
                    options={INITIATORS}
                    value={initiatedBy}
                    onChange={(next) => revise(() => setInitiatedBy(next))}
                  />
                </div>

                <Field label="What happened?" htmlFor={`${ids}-note`} required>
                  <Textarea
                    id={`${ids}-note`}
                    placeholder="What did you discuss, decide, or promise?"
                    autoGrow={false}
                    rows={4}
                    value={note}
                    onChange={(e) => revise(() => setNote(e.target.value))}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        (e.metaKey || e.ctrlKey) &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        save();
                      }
                    }}
                  />
                </Field>

                <Field
                  label="Follow-up reminder"
                  htmlFor={`${ids}-follow`}
                  help={
                    followDue
                      ? 'Undoing the interaction keeps this reminder. Manage it from Reminders.'
                      : 'Optional. Choose when this should return to your agenda.'
                  }
                >
                  <Input
                    id={`${ids}-follow`}
                    type="date"
                    value={followDue}
                    onChange={(e) => revise(() => setFollowDue(e.target.value))}
                  />
                </Field>
                <p className="m-0 text-xs text-muted">
                  Ctrl / ⌘ + Enter to save. Enter adds a new line.
                </p>
              </Stack>
            </fieldset>
          </form>
        </Stack>
      </Modal>
      {guard.prompt}
    </>
  );
}
