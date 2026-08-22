import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Field, FilterGroup, Input, Modal, Stack } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';

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

interface LogResponse {
  interaction: { id: string };
  strength: { strength: number };
}

/**
 * One-tap interaction logger overlay (SRS P09, FR-CON-002/003). Logs the
 * interaction, recomputes strength server-side, and offers toast-undo.
 *
 * FR-022/FR-023: a real Modal (name, focus trap, Esc, focus restoration) and a
 * real label on every input.
 *
 * The save is a `useMutation` rather than a bare `async` function called as
 * `void save()`. That spelling had no catch, so a rejected POST became an
 * unhandled rejection: the button flipped back to "Save", the overlay stayed
 * open, and nothing anywhere said the interaction had not been recorded. The
 * mutation reports the failure in the overlay and, having no local `onError`,
 * also reaches the global mutation error toast.
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
  const [note, setNote] = useState('');
  const [followDue, setFollowDue] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());
  const ids = useId();
  const qc = useQueryClient();
  const { flash } = useToast();

  const log = useMutation({
    mutationFn: () =>
      api.post<LogResponse>('/interactions', {
        personId,
        kind,
        note,
        occurredAt: new Date().toISOString(),
        followUpDate: followDue || undefined,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async (res) => {
      onClose();
      await qc.invalidateQueries();
      flash(`Logged ${kind} with ${personName} · strength recomputed`, {
        undo: async () => {
          await api.del(`/interactions/${res.interaction.id}`);
          await qc.invalidateQueries();
        },
      });
    },
  });

  const canSave = note.trim().length > 0 && !log.isPending;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Log interaction · ${personName}`}
      description={`Record what happened with ${personName} and optionally queue a follow-up.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => log.mutate()}>
            {log.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {log.isError && (
          <Banner tone="danger" title="This interaction was not logged">
            {log.error instanceof Error
              ? log.error.message
              : 'The interaction could not be recorded. Try Save again.'}
          </Banner>
        )}

        {/* The Field shell without a Field: FilterGroup names its own group, so
            a <label> here would point at nothing. Reusing the class keeps this
            label on the same rhythm as the two real fields below it. */}
        <div className="vt-fld">
          <span className="vt-fld__label">Kind</span>
          <FilterGroup label="Kind" options={KINDS} value={kind} onChange={setKind} />
        </div>

        <Field label="What happened?" htmlFor={`${ids}-note`} required>
          <Input
            id={`${ids}-note`}
            placeholder="One line: what happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) log.mutate();
            }}
          />
        </Field>

        <Field label="Follow-up reminder" htmlFor={`${ids}-follow`} help="Optional">
          <Input
            id={`${ids}-follow`}
            type="date"
            value={followDue}
            onChange={(e) => setFollowDue(e.target.value)}
          />
        </Field>
      </Stack>
    </Modal>
  );
}
