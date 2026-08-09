import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';

const KINDS: Array<{ kind: string; glyph: string }> = [
  { kind: 'coffee', glyph: '☕' },
  { kind: 'call', glyph: '✆' },
  { kind: 'video', glyph: '▷' },
  { kind: 'message', glyph: '✉' },
  { kind: 'meeting', glyph: '◈' },
];

interface LogResponse {
  interaction: { id: string };
  strength: { strength: number };
}

/**
 * One-tap interaction logger overlay (SRS P09, FR-CON-002/003). Logs the
 * interaction, recomputes strength server-side, and offers toast-undo.
 *
 * FR-022/FR-023: a real Modal (name, focus trap, Esc, focus restoration); the
 * kind chips are a labelled radio group rather than unlabelled buttons whose
 * only selected-state signal was a border colour; every input has a real label.
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
  const [kind, setKind] = useState('coffee');
  const [note, setNote] = useState('');
  const [followDue, setFollowDue] = useState('');
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const ids = useId();
  const qc = useQueryClient();
  const { flash } = useToast();

  async function save() {
    setBusy(true);
    try {
      const res = await api.post<LogResponse>('/interactions', {
        personId,
        kind,
        note,
        occurredAt: new Date().toISOString(),
        followUpDate: followDue || undefined,
        idempotencyKey: idempotencyKey.current,
      });
      onClose();
      await qc.invalidateQueries();
      flash(`Logged ${kind} with ${personName} · strength recomputed`, {
        undo: async () => {
          await api.del(`/interactions/${res.interaction.id}`);
          await qc.invalidateQueries();
        },
      });
    } finally {
      setBusy(false);
    }
  }

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
          <Button variant="primary" disabled={busy || !note.trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="label" id={`${ids}-kind`}>
          Kind
        </span>
        <div className="chips" role="radiogroup" aria-labelledby={`${ids}-kind`} style={{ marginBottom: 12 }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={k.kind === kind}
              className="vt-chip"
              style={{
                cursor: 'pointer',
                ...(k.kind === kind ? { borderColor: 'var(--ae-accent)', color: 'var(--ae-accent-soft)' } : {}),
              }}
              onClick={() => setKind(k.kind)}
            >
              <span aria-hidden>{k.glyph}</span> {k.kind}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-note`}>
          What happened?
        </label>
        <input
          id={`${ids}-note`}
          className="input"
          placeholder="One line: what happened?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && note.trim()) void save();
          }}
        />
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label className="label" htmlFor={`${ids}-follow`}>
          Follow-up reminder (optional)
        </label>
        <input
          id={`${ids}-follow`}
          className="input"
          type="date"
          value={followDue}
          onChange={(e) => setFollowDue(e.target.value)}
        />
      </div>
    </Modal>
  );
}
