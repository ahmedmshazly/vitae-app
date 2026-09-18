import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Field, Textarea, StatusTrace } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
import { useUnsavedChanges } from '../lib/unsaved-changes.js';
import { useToast } from './Toast.js';

export interface PersonFavor {
  id?: string;
  direction: 'owed_to_me' | 'owed_by_me';
  what: string;
  settled?: boolean;
}
type FavorRequest = { key: string; direction: PersonFavor['direction']; what: string };
type Enqueue = <T>(write: () => Promise<T>) => Promise<T>;

function FavorRow({
  personId,
  favor,
  enqueue,
}: {
  personId: string;
  favor: PersonFavor;
  enqueue: Enqueue;
}) {
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const flight = useRef(false);
  const { flash } = useToast();
  const settle = useMutation({
    mutationFn: () =>
      enqueue(() => api.patch(`/people/${personId}/favors/${favor.id}`, { settled: true })),
    onError: () => {
      // The row owns recovery; suppress the global fallback error toast.
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['person-summary', personId] }),
        qc.invalidateQueries({ queryKey: ['node', personId] }),
        qc.invalidateQueries({ queryKey: ['people'] }),
      ]);
      flash('Favor marked settled');
    },
  });
  async function submit() {
    if (flight.current || !canWrite || !favor.id) return;
    flight.current = true;
    try {
      await settle.mutateAsync();
    } catch {
      /* Keep the error beside its row. */
    } finally {
      flight.current = false;
    }
  }
  return (
    <li>
      <div className="row network-favor">
        <Chip tone={favor.direction === 'owed_to_me' ? 'success' : 'warning'}>
          {favor.direction === 'owed_to_me' ? 'They owe you' : 'You owe them'}
        </Chip>
        <div className="row__main">
          <div className={favor.settled ? 'row__title text-faint line-through' : 'row__title'}>
            {favor.what || '(no description)'}
          </div>
          {!favor.settled && !favor.id && (
            <p className="network-favor__note">
              This older entry has no identifier, so it cannot be settled here. Adding it again
              would create a separate commitment.
            </p>
          )}
        </div>
        {favor.settled ? (
          <Chip tone="success" glyph="check">
            settled
          </Chip>
        ) : favor.id ? (
          <Button
            type="button"
            size="sm"
            disabled={settle.isPending || !canWrite}
            title={canWrite ? undefined : WRITE_LOCK_HINT}
            onClick={() => void submit()}
          >
            {settle.isPending ? 'Settling...' : 'Settle'}
          </Button>
        ) : (
          <Chip mono>not settleable</Chip>
        )}
      </div>
      {settle.isError && (
        <StatusTrace
          tone="danger"
          label="Settlement not confirmed"
          detail={`${settle.error instanceof Error ? settle.error.message : 'The request did not finish.'} Try Settle again to confirm it.`}
        />
      )}
    </li>
  );
}

export function PersonFavors({
  personId,
  favors,
  hasRelationship,
}: {
  personId: string;
  favors: PersonFavor[];
  hasRelationship: boolean;
}) {
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const { flash } = useToast();
  const flight = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Favor writes replace one shared edge ledger. Keep this page's writes in
  // order while allowing another row to queue its own settlement.
  const enqueue: Enqueue = (write) => {
    const next = queue.current.then(write, write);
    queue.current = next.catch(() => undefined);
    return next;
  };
  const [note, setNote] = useState('');
  const [request, setRequest] = useState<FavorRequest | null>(null);
  const [limit, setLimit] = useState(20);
  const add = useMutation({
    mutationFn: (payload: FavorRequest) =>
      enqueue(() =>
        api.post(
          `/people/${personId}/favors`,
          { direction: payload.direction, what: payload.what },
          { idempotencyKey: payload.key },
        ),
      ),
    onError: () => {
      // The retained draft owns recovery; do not announce the failure twice.
    },
    onSuccess: async (_data, payload) => {
      setNote('');
      setRequest(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['person-summary', personId] }),
        qc.invalidateQueries({ queryKey: ['node', personId] }),
        qc.invalidateQueries({ queryKey: ['people'] }),
      ]);
      flash(
        payload.direction === 'owed_to_me' ? 'Recorded: they owe you' : 'Recorded: you owe them',
      );
    },
  });
  const guard = useUnsavedChanges(Boolean(note.trim() || request) || add.isPending, {
    busy: add.isPending,
    onClose: () => {
      setNote('');
      setRequest(null);
      add.reset();
    },
    ...(add.isError
      ? {
          body: 'The last save could not be confirmed. Discarding the draft does not remove a favor that may already have been recorded. Keep editing to retry the same request.',
        }
      : {}),
  });
  async function submit(direction: PersonFavor['direction']) {
    if (flight.current || !canWrite || !hasRelationship || !note.trim()) return;
    const payload = request ?? { key: crypto.randomUUID(), direction, what: note.trim() };
    flight.current = true;
    setRequest(payload);
    try {
      await add.mutateAsync(payload);
    } catch {
      /* Retry uses this exact favor key and payload. */
    } finally {
      flight.current = false;
    }
  }
  return (
    <div className="person-favors">
      {favors.length === 0 ? (
        <p className="network-section-note">
          No favors recorded. Add only a concrete commitment you would be comfortable acting on
          later.
        </p>
      ) : (
        <>
          <ul className="network-rows" aria-label="Favors">
            {favors.slice(0, limit).map((favor, index) => (
              <FavorRow
                key={favor.id ?? `legacy-${index}`}
                personId={personId}
                favor={favor}
                enqueue={enqueue}
              />
            ))}
          </ul>
          {limit < favors.length && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setLimit((value) => value + 20)}
            >
              Show more favors ({Math.min(limit, favors.length)} of {favors.length})
            </Button>
          )}
        </>
      )}
      {!canWrite ? (
        <p className="text-sm text-muted">{WRITE_LOCK_HINT}</p>
      ) : !hasRelationship ? (
        <p className="text-sm text-muted">
          Connect this person to your own record with a “Knows” relationship before recording a
          favor.
        </p>
      ) : (
        <>
          <Field
            label="Favor description"
            htmlFor={`favor-${personId}`}
            help="Describe the commitment, then choose who owes it."
          >
            <Textarea
              id={`favor-${personId}`}
              rows={2}
              placeholder="An introduction to Yara"
              value={note}
              disabled={add.isPending || request !== null}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {add.isError && (
            <StatusTrace
              tone="danger"
              label="Favor save not confirmed"
              detail={`${add.error instanceof Error ? add.error.message : 'The request did not finish.'} Your description is safe. Retry confirms the same favor without adding a duplicate.`}
            />
          )}
          <div className="person-favors__actions">
            {note.trim() && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={add.isPending}
                onClick={guard.requestClose}
              >
                Discard draft
              </Button>
            )}
            {request && add.isError ? (
              <Button type="button" size="sm" onClick={() => void submit(request.direction)}>
                Retry favor
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={!note.trim() || add.isPending}
                  onClick={() => void submit('owed_to_me')}
                >
                  {add.isPending && request?.direction === 'owed_to_me'
                    ? 'Recording...'
                    : 'They owe'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!note.trim() || add.isPending}
                  onClick={() => void submit('owed_by_me')}
                >
                  {add.isPending && request?.direction === 'owed_by_me' ? 'Recording...' : 'I owe'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
      {guard.prompt}
    </div>
  );
}
