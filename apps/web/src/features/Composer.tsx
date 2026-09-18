import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Checkbox,
  Chip,
  ChipGroup,
  ConfirmDialog,
  ErrorState,
  Field,
  FilterGroup,
  Modal,
  SkeletonText,
  StatusTrace,
  Textarea,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';
import { entityHref } from '../lib/entity-href.js';
import { useUnsavedChanges } from '../lib/unsaved-changes.js';
import { useToast } from './Toast.js';

export interface ComposerContext {
  personId: string;
  personName: string;
  kind: 'intro' | 'referral' | 'nudge' | 'reconnect' | 'explore';
  channel?: string;
  targetPersonId?: string;
  targetOrgId?: string;
  targetOrgName?: string;
  roleTitle?: string;
}
const TONES = ['warm', 'direct', 'formal'] as const;
type Tone = (typeof TONES)[number];
interface Draft {
  body: string;
  facts: string[];
}

/** A changed recipient or target owns a fresh session, including outstanding requests. */
export function Composer(props: { ctx: ComposerContext; onClose: () => void }) {
  return <ComposerSession key={JSON.stringify(props.ctx)} {...props} />;
}

function ComposerSession({ ctx, onClose }: { ctx: ComposerContext; onClose: () => void }) {
  const ids = useId();
  const canWrite = useCanWrite();
  const [tone, setTone] = useState<Tone>('warm');
  const [draftTone, setDraftTone] = useState<Tone>('warm');
  const [body, setBody] = useState('');
  const [facts, setFacts] = useState<string[]>([]);
  const [edited, setEdited] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [sentOutside, setSentOutside] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const qc = useQueryClient();
  const { flash } = useToast();
  const ticket = useRef(0);
  const logging = useRef(false);
  const logErrorRef = useRef<HTMLDivElement>(null);

  const draftM = useMutation({
    mutationFn: async (t: Tone): Promise<(Draft & { tone: Tone }) | null> => {
      const mine = ++ticket.current;
      try {
        const res = await api.post<Draft>('/composer/draft', {
          personId: ctx.personId,
          kind: ctx.kind,
          tone: t,
          targetPersonId: ctx.targetPersonId,
          targetOrgId: ctx.targetOrgId,
          roleTitle: ctx.roleTitle,
        });
        if (
          typeof res.body !== 'string' ||
          !res.body.trim() ||
          !Array.isArray(res.facts) ||
          res.facts.some((fact) => typeof fact !== 'string')
        ) {
          throw new Error('The draft was incomplete. Try generating it again.');
        }
        return mine === ticket.current ? { ...res, tone: t } : null;
      } catch (err) {
        if (mine !== ticket.current) return null;
        throw err;
      }
    },
    onSuccess: (res) => {
      if (!res) return;
      setBody(res.body);
      setFacts(res.facts);
      setDraftTone(res.tone);
      setEdited(false);
      setHasDraft(true);
      setSentOutside(false);
    },
    // The persistent local error owns recovery; suppress the global fallback toast.
    onError: () => {},
  });
  function generate(t: Tone) {
    if (logging.current) return;
    setTone(t);
    draftM.mutate(t);
  }
  const requestDraft = draftM.mutate;
  useEffect(() => {
    requestDraft('warm');
    return () => {
      ticket.current += 1;
    };
  }, [requestDraft]);

  function pickTone(t: Tone) {
    if (logging.current) return;
    setTone(t);
    if (!edited) generate(t);
  }

  // This endpoint logs only. It has no delivery or idempotency contract.
  const logM = useMutation({
    mutationFn: (submission: { personId: string; kind: string; channel: string; body: string }) =>
      api.post('/composer/send', submission),
    onSuccess: () => {
      guard.forceClose();
      flash(`Outreach to ${ctx.personName} logged · follow-up set for seven days`);
      void qc.invalidateQueries();
    },
    onError: () => {}, // Report uncertainty next to the draft, not in a second toast.
    onSettled: () => {
      logging.current = false;
    },
  });
  useEffect(() => {
    if (logM.isError) logErrorRef.current?.focus();
  }, [logM.isError]);
  const guard = useUnsavedChanges(edited || logM.isPending || logM.isError, {
    onClose,
    busy: logM.isPending,
    body: logM.isError
      ? 'Logging was not confirmed and may already exist. Closing discards this local draft; it does not remove a saved interaction.'
      : 'Your edits are only in this draft. Copy them before leaving, or keep editing.',
  });
  const drafting = draftM.isPending || draftM.status === 'idle';
  const draftError = draftM.isError
    ? (draftM.error instanceof Error && draftM.error.message.trim()) ||
      'The draft could not be generated. Try again.'
    : null;
  const blocked = drafting || !body.trim() || !hasDraft;
  function logOutreach() {
    if (logging.current || blocked || !canWrite || !sentOutside) return;
    logging.current = true;
    logM.mutate({ personId: ctx.personId, kind: ctx.kind, channel: ctx.channel ?? 'email', body });
  }
  function copyDraft() {
    if (!navigator.clipboard) {
      flash('Clipboard is not available here, select the draft and copy it manually.', {
        variant: 'error',
      });
      return;
    }
    void navigator.clipboard
      .writeText(body)
      .then(() => flash('Copied draft to clipboard'))
      .catch(() =>
        flash("Couldn't reach the clipboard, select the text and copy it.", { variant: 'error' }),
      );
  }

  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!logging.current) guard.onOpenChange(open);
        }}
        title={`Draft ${ctx.kind} · ${ctx.personName}`}
        description="Vitae does not send messages. Copy and send outside Vitae, then log outreach here with a seven-day follow-up."
        size="lg"
        footer={
          <div className="outreach-composer__footer">
            <Button
              variant="ghost"
              disabled={drafting || logM.isPending}
              onClick={() => (edited ? setConfirmRegenerate(true) : generate(tone))}
            >
              {drafting ? 'Regenerating...' : 'Regenerate'}
            </Button>
            <div className="outreach-composer__actions">
              <Button variant="ghost" disabled={blocked} onClick={copyDraft}>
                Copy
              </Button>
              <Button
                variant="primary"
                disabled={blocked || logM.isPending || !canWrite || !sentOutside}
                title={!canWrite ? WRITE_LOCK_HINT : undefined}
                onClick={logOutreach}
              >
                {logM.isPending
                  ? 'Logging…'
                  : logM.isError
                    ? 'Retry logging'
                    : 'Log outreach & follow-up'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="outreach-composer">
          {ctx.targetOrgName && (
            <p className="outreach-composer__context">
              Request context: <strong>{ctx.targetOrgName}</strong>. Check that the draft names the
              right organization and request.
            </p>
          )}
          <fieldset className="outreach-composer__tones" disabled={logM.isPending}>
            <FilterGroup
              label="Tone"
              options={TONES.map((t) => ({ key: t, label: t }))}
              value={tone}
              onChange={pickTone}
            />
          </fieldset>
          {edited && (
            <p className="outreach-composer__hint" role="status">
              Your edits are retained. Regenerate to apply {tone} tone.
            </p>
          )}
          {!edited && hasDraft && tone !== draftTone && (
            <p className="outreach-composer__hint">
              Showing the last {draftTone} draft until a new one is ready.
            </p>
          )}
          {logM.isError && (
            <div ref={logErrorRef} tabIndex={-1}>
              <Banner tone="danger" title="Outreach logging was not confirmed">
                {(logM.error instanceof Error && logM.error.message.trim()) ||
                  'The request did not return a confirmation.'}{' '}
                Your draft is still here. Check the profile before retrying: the outreach may
                already be logged, and retrying can create a duplicate.{' '}
                <Link to={entityHref('person', ctx.personId)}>Check profile</Link>
              </Banner>
            </div>
          )}
          {draftError &&
            (hasDraft ? (
              <Banner
                tone="danger"
                title="Couldn't regenerate the draft"
                action={
                  <Button
                    size="sm"
                    disabled={drafting || logM.isPending}
                    onClick={() => generate(tone)}
                  >
                    Try again
                  </Button>
                }
              >
                {draftError} Your previous draft is still available below.
              </Banner>
            ) : (
              <ErrorState
                title="Couldn't draft that message"
                detail={draftError}
                onRetry={() => generate(tone)}
                retrying={drafting}
              />
            ))}
          {drafting && (
            <div aria-busy="true">
              <StatusTrace tone="live" label="Assembling the draft" detail={`${tone} tone`} />
              {!hasDraft && <SkeletonText lines={6} />}
            </div>
          )}
          {hasDraft && (
            <>
              {facts.length > 0 && (
                <div>
                  <p className="outreach-composer__hint">Recorded context used in this draft</p>
                  <ChipGroup>
                    {facts.map((fact, i) => (
                      <Chip key={i}>{fact}</Chip>
                    ))}
                  </ChipGroup>
                </div>
              )}
              <Field label="Draft message" htmlFor={`${ids}-body`}>
                <Textarea
                  id={`${ids}-body`}
                  rows={9}
                  value={body}
                  disabled={drafting || logM.isPending}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setEdited(true);
                    setSentOutside(false);
                  }}
                />
              </Field>
              <Checkbox
                checked={sentOutside}
                onChange={setSentOutside}
                disabled={drafting || logM.isPending || !canWrite}
                align="start"
                label="I have sent this message outside Vitae"
              />
              {!canWrite && (
                <p role="status" className="outreach-composer__hint">
                  {WRITE_LOCK_HINT} You can still edit and copy this draft.
                </p>
              )}
            </>
          )}
        </div>
      </Modal>
      {guard.prompt}
      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Replace your edited draft?"
        body="A new draft will replace your edits. If generation fails, your current text will be kept."
        confirmLabel="Replace draft"
        cancelLabel="Keep editing"
        initialFocus="cancel"
        onConfirm={() => {
          setConfirmRegenerate(false);
          generate(tone);
        }}
      />
    </>
  );
}
