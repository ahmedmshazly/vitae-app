import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, ErrorState, FilterGroup, Modal, SkeletonText } from '@vitae/ui';
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
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const { flash } = useToast();

  async function generate(t: Tone) {
    setLoading(true);
    setFailed(null);
    try {
      const res = await api.post<{ body: string; facts: string[] }>('/composer/draft', {
        personId: ctx.personId,
        kind: ctx.kind,
        tone: t,
        targetPersonId: ctx.targetPersonId,
        targetOrgId: ctx.targetOrgId,
        roleTitle: ctx.roleTitle,
      });
      setBody(res.body);
      setFacts(res.facts);
      setEdited(false);
    } catch (err) {
      // try/finally with no catch: a failed draft used to leave an empty
      // textarea above an enabled Send button, saying nothing at all.
      setFailed(err instanceof Error ? err.message : 'The draft could not be assembled.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void generate('warm');
     
  }, [ctx.personId, ctx.kind]);

  function pickTone(t: Tone) {
    setTone(t);
    if (!edited) void generate(t);
  }

  async function send() {
    setSending(true);
    try {
      await api.post('/composer/send', {
        personId: ctx.personId,
        kind: ctx.kind,
        channel: ctx.channel ?? 'email',
        body,
      });
      onClose();
      flash(`Queued ${ctx.channel ?? 'email'} to ${ctx.personName} · logged as outreach`);
      await qc.invalidateQueries();
    } catch (err) {
      flash(err instanceof Error ? `Send failed: ${err.message}` : 'Send failed');
    } finally {
      setSending(false);
    }
  }

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
        <div className="spread" style={{ width: '100%' }}>
          <div className="hstack">
            <Button variant="ghost" size="sm" onClick={() => void generate(tone)}>
              Regenerate
            </Button>
            {edited && (
              <span className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
                edited, tone switch won&apos;t overwrite
              </span>
            )}
          </div>
          <div className="hstack">
            <Button
              variant="ghost"
              disabled={!body.trim()}
              onClick={() => {
                // Reported success unconditionally, including when there was no
                // clipboard to write to and when the write rejected.
                void navigator.clipboard
                  ?.writeText(body)
                  .then(() => flash('Copied draft to clipboard'))
                  .catch(() => flash('Couldn’t reach the clipboard, select the text and copy it.', { variant: 'error' }));
              }}
            >
              Copy
            </Button>
            <Button variant="primary" disabled={sending || loading || !!failed || !body.trim()} onClick={() => void send()}>
              {sending ? 'Queuing…' : 'Send & log'}
            </Button>
          </div>
        </div>
      }
    >
      {facts.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>
          {facts.map((f) => (
            <Chip key={f} mono>
              {f}
            </Chip>
          ))}
        </div>
      )}

      {failed ? (
        <ErrorState title="Couldn’t draft that message" detail={failed} onRetry={() => void generate(tone)} />
      ) : loading ? (
        // A skeleton in the shape of the draft, not a spinner in the middle of
        // a large empty modal.
        <SkeletonText lines={6} />
      ) : (
        <div className="field">
          <label className="label" htmlFor={`${ids}-body`}>
            Draft message
          </label>
          <textarea
            id={`${ids}-body`}
            className="textarea"
            style={{ minHeight: 200, fontFamily: 'var(--ae-font-sans)' }}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setEdited(true);
            }}
          />
        </div>
      )}
    </Modal>
  );
}
