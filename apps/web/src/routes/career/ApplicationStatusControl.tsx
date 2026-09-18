import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APPLICATION_STATUSES, APPLICATION_STATUS_FLOW, type ApplicationStatus } from '@vitae/core';
import { Banner, Button, FilterGroup, Modal, Stack } from '@vitae/ui';
import { api } from '../../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { useToast } from '../../features/Toast.js';
import { STATUS_LABEL } from './application-view.js';

interface StatusChange {
  status: ApplicationStatus;
  correction?: boolean;
}

/**
 * The status control on an application dossier (FR-CAR-003).
 *
 * It offers the moves the server would accept and nothing else. Rendering all
 * eight statuses with five of them greyed out would be asking the operator to
 * read a disabled control to learn a rule; offering the three that are legal
 * says the same thing and asks nothing.
 *
 * Correction sits behind its own button because it is a different claim. A move
 * says the application reached a new stage; a correction says the last status
 * was never true. Putting them in one picker would let a mis-click rewrite
 * history as though it had happened, which is the one thing the guard exists to
 * prevent. It is offered from every status, closed ones included: an operator
 * who mis-set a record to rejected has no other way back, and a guard that
 * makes true data unfixable is worse than no guard.
 */
export function ApplicationStatusControl({
  id,
  status,
  disabled = false,
}: {
  id: string;
  status: ApplicationStatus;
  disabled?: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [correctTo, setCorrectTo] = useState<ApplicationStatus | null>(null);
  const ids = useId();
  const qc = useQueryClient();
  const { flash } = useToast();
  const canWrite = useCanWrite();
  const inFlight = useRef(false);

  const change = useMutation({
    mutationKey: ['application-status', id],
    mutationFn: (next: StatusChange) => api.post(`/applications/${id}/status`, next),
    onSuccess: async (_result, next) => {
      await qc.invalidateQueries({ queryKey: ['application', id] });
      await qc.invalidateQueries({ queryKey: ['applications'] });
      guard.forceClose();
      flash(
        next.correction
          ? `Status corrected to ${STATUS_LABEL[next.status]}`
          : `Moved to ${STATUS_LABEL[next.status]}`,
      );
    },
    onSettled: () => {
      inFlight.current = false;
    },
    // The attempt has one local recovery message, including inside the dialog.
    onError: () => {},
  });

  const guard = useUnsavedChanges((correcting && Boolean(correctTo)) || change.isPending, {
    busy: change.isPending,
    onClose: () => {
      setCorrecting(false);
      setCorrectTo(null);
      change.reset();
    },
  });
  const locked = !canWrite || disabled || change.isPending;

  function record(next: StatusChange) {
    if (locked || inFlight.current) return;
    inFlight.current = true;
    change.mutate(next);
  }

  const onward = APPLICATION_STATUS_FLOW[status];
  const closeCorrection = () => {
    if (!change.isPending) guard.requestClose();
  };
  const selectCorrection = (next: ApplicationStatus) => {
    if (locked) return;
    setCorrectTo(next);
    // The server evaluated the previous selection. Once it changes, keep the
    // old refusal out of the way until this distinct correction is submitted.
    if (change.isError) change.reset();
  };
  // The banner belongs wherever the attempt was made. A refused move is
  // reported beside the buttons, a refused correction inside the dialog.
  const failed = change.isError ? change.variables : null;
  const message =
    change.error instanceof Error
      ? change.error.message
      : 'The status could not be confirmed. Refresh the application before retrying.';

  return (
    <section aria-labelledby={`${ids}-title`} className="mb-8 border-b border-hairline pb-6">
      <h2 id={`${ids}-title`} className="mb-3 text-sm font-medium text-muted">
        Status
      </h2>

      {failed && !failed.correction ? (
        <Banner tone="danger" title="Status move not confirmed" className="mb-3">
          {message}
          <p className="mt-2">
            Your selection is still here. Refresh the application before retrying if the response
            was interrupted.
          </p>
        </Banner>
      ) : null}

      {!canWrite ? (
        <p className="m-0 mb-3 text-sm text-muted">{WRITE_LOCK_HINT}</p>
      ) : onward.length > 0 ? (
        <div role="group" aria-label="Record a status move" className="flex flex-wrap gap-2">
          {onward.map((next) => (
            <Button key={next} disabled={locked} onClick={() => record({ status: next })}>
              {change.isPending && change.variables?.status === next && !change.variables.correction
                ? `Recording ${STATUS_LABEL[next]}…`
                : STATUS_LABEL[next]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted">
          {STATUS_LABEL[status]} closes this application. Nothing follows an outcome.
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-3">
        <Button
          variant="ghost"
          glyph="adjust"
          disabled={locked}
          onClick={() => {
            change.reset();
            setCorrecting(true);
          }}
        >
          Correct status
        </Button>
        <p className="mt-1 text-sm text-faint">
          A correction says the recorded status was wrong. It does not claim the application moved.
        </p>
      </div>

      {correcting ? (
        <Modal
          open
          onOpenChange={(open) => !open && closeCorrection()}
          title="Correct the recorded status"
          description={`This application is recorded as ${STATUS_LABEL[status]}. Choose what it should have said.`}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={closeCorrection} disabled={change.isPending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!correctTo || locked}
                onClick={() => correctTo && record({ status: correctTo, correction: true })}
              >
                {change.isPending ? 'Saving...' : 'Record correction'}
              </Button>
            </>
          }
        >
          <Stack gap={4}>
            {failed?.correction ? (
              <Banner tone="danger" title="Correction not confirmed">
                {message}
                <p className="mt-2">
                  Your selection is still here. Refresh the application before retrying if the
                  response was interrupted.
                </p>
              </Banner>
            ) : null}

            {/* The Field shell without a Field: FilterGroup names its own
                group, so a label element here would point at nothing. Choosing
                and confirming stay two steps, because a correction rewrites
                what the record claims already happened. */}
            <fieldset className="application-correction-fields vt-fld" disabled={locked}>
              <legend className="u-visually-hidden">Correction selection</legend>
              <span className="vt-fld__label">What the status should say</span>
              <FilterGroup
                label="What the status should say"
                options={APPLICATION_STATUSES.filter((option) => option !== status).map(
                  (option) => ({ key: option, label: STATUS_LABEL[option] }),
                )}
                // Nothing reads as chosen until one is: the current status is
                // not among the options, so no button starts pressed.
                value={correctTo ?? status}
                onChange={selectCorrection}
              />
            </fieldset>
            {!canWrite && <p className="text-sm text-muted">{WRITE_LOCK_HINT}</p>}
            <p className="m-0 text-sm text-faint">
              Recorded as a correction, not as a move. The history keeps the difference.
            </p>
          </Stack>
        </Modal>
      ) : null}
      {guard.prompt}
    </section>
  );
}
