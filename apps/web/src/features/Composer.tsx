import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ChipGroup,
  ErrorState,
  Field,
  FilterGroup,
  Inline,
  Modal,
  SkeletonText,
  Spread,
  StatusTrace,
  Textarea,
} from '@vitae/ui';
import { api } from '../lib/api.js';
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

/**
 * Outreach composer (reference P: composer). Deterministic drafts assembled
 * server-side from live relationship facts; tone switch regenerates unless
 * the body has been hand-edited.
 *
 * FR-022/FR-023: a real Modal, with the tone switch exposed as a labelled radio
 * group and the draft body as a labelled textarea.
 */
export function Composer({ ctx, onClose }: { ctx: ComposerContext; onClose: () => void }) {
  const ids = useId();
  const [tone, setTone] = useState<Tone>('warm');
  const [body, setBody] = useState('');
  const [facts, setFacts] = useState<string[]>([]);
  const [edited, setEdited] = useState(false);
  const qc = useQueryClient();
  const { flash } = useToast();

  /**
   * Which draft request is the live one. Two POSTs used to race: flipping tone
   * mid-fetch let whichever resolved last win, so a warm draft could land
   * under a formal pill. A superseded request now resolves to null and writes
   * nothing.
   */
  const ticket = useRef(0);

  const draftM = useMutation({
    mutationFn: async (t: Tone): Promise<Draft | null> => {
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
        return mine === ticket.current ? res : null;
      } catch (err) {
        // A failure the user has already moved past is not their failure to
        // read. Only the live request may report one.
        if (mine !== ticket.current) return null;
        throw err;
      }
    },
    onSuccess: (res) => {
      if (!res) return;
      setBody(res.body);
      setFacts(res.facts);
      setEdited(false);
    },
  });

  /**
   * Every control that describes the draft resets with the request, not after
   * it. A new context replaces the composer in place without unmounting it, so
   * a tone pill and an edited flag left behind would describe the previous
   * recipient's message, and the evidence chips would cite a draft that is no
   * longer on screen.
   */
  function generate(t: Tone) {
    setTone(t);
    setEdited(false);
    setFacts([]);
    draftM.mutate(t);
  }

  // Keyed on who and what is being asked, not on `generate`, which is a new
  // function every render.
  useEffect(() => {
    generate('warm');
  }, [ctx.personId, ctx.kind]);

  function pickTone(t: Tone) {
    setTone(t);
    if (!edited) generate(t);
  }

  const sendM = useMutation({
    mutationFn: () =>
      api.post('/composer/send', {
        personId: ctx.personId,
        kind: ctx.kind,
        channel: ctx.channel ?? 'email',
        body,
      }),
    onSuccess: async () => {
      onClose();
      flash(`Queued ${ctx.channel ?? 'email'} to ${ctx.personName} · logged as outreach`);
      await qc.invalidateQueries();
    },
    onError: (err) =>
      flash(err instanceof Error ? `Send failed: ${err.message}` : 'Send failed', {
        variant: 'error',
      }),
  });

  function copyDraft() {
    // The optional chain used to short-circuit the whole expression, so where
    // there is no clipboard neither handler ever attached and Copy was a
    // silent no-op. Check for the API before reaching for it.
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
        flash('Couldn’t reach the clipboard, select the text and copy it.', { variant: 'error' }),
      );
  }

  // `idle` is the single commit between mount and the first request. Reading it
  // as drafting keeps the skeleton in place instead of flashing an empty box.
  const drafting = draftM.isPending || draftM.status === 'idle';
  const draftError = draftM.isError ? ((draftM.error as Error | null)?.message ?? null) : null;
  const sendError = sendM.isError ? ((sendM.error as Error | null)?.message ?? null) : null;
  const blocked = drafting || draftError !== null || !body.trim();

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Draft ${ctx.kind} · ask ${ctx.personName}${ctx.targetOrgName ? ` → ${ctx.targetOrgName}` : ''}`}
      description="A draft assembled from your real relationship history. Edit it before sending, it is a starting point, not a send button."
      size="lg"
      // Was three chips whose selected state was an inline border colour, two
      // of whose three declarations named tokens that do not exist. FilterGroup
      // carries the state in aria-pressed and in a real pressed style.
      titleAccessory={
        <FilterGroup
          label="Tone"
          options={TONES.map((t) => ({ key: t, label: t }))}
          value={tone}
          onChange={pickTone}
        />
      }
      footer={
        <Spread className="w-full">
          <Inline>
            <Button
              variant="ghost"
              size="sm"
              disabled={drafting}
              onClick={() => generate(tone)}
            >
              {drafting ? 'Regenerating…' : 'Regenerate'}
            </Button>
            {edited && (
              <span className="text-xs text-faint">edited, tone switch won&apos;t overwrite</span>
            )}
          </Inline>
          <Inline>
            <Button variant="ghost" disabled={blocked} onClick={copyDraft}>
              Copy
            </Button>
            <Button
              variant="primary"
              disabled={blocked || sendM.isPending}
              onClick={() => sendM.mutate()}
            >
              {sendM.isPending ? 'Queuing…' : 'Send & log'}
            </Button>
          </Inline>
        </Spread>
      }
    >
      {/* A failed send is the one failure that costs the user their typing, so
          it stays on the surface that holds the text rather than living only
          in a toast that has already gone. */}
      {sendError && (
        <Banner
          tone="danger"
          title="This message was not sent"
          action={
            <Button size="sm" disabled={sendM.isPending} onClick={() => sendM.mutate()}>
              {sendM.isPending ? 'Sending…' : 'Try again'}
            </Button>
          }
        >
          {sendError} Your draft is still here, nothing was logged.
        </Banner>
      )}

      {facts.length > 0 && (
        <ChipGroup className="mb-3">
          {facts.map((f) => (
            <Chip key={f} mono>
              {f}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {draftError ? (
        <ErrorState
          title="Couldn’t draft that message"
          detail={draftError}
          onRetry={() => generate(tone)}
        />
      ) : drafting ? (
        // A skeleton in the shape of the draft, not a spinner in the middle of
        // a large empty modal. The trace above it is what says out loud that
        // the wait is deliberate: the skeleton itself is aria-hidden.
        <div aria-busy="true">
          <StatusTrace tone="live" label="Assembling the draft" detail={`${tone} tone`} />
          <SkeletonText lines={6} />
        </div>
      ) : (
        <Field label="Draft message" htmlFor={`${ids}-body`}>
          <Textarea
            id={`${ids}-body`}
            rows={9}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setEdited(true);
            }}
          />
        </Field>
      )}
    </Modal>
  );
}
