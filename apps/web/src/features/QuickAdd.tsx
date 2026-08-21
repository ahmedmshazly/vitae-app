import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Chip, CommandOverlay, Glyph, Kbd, StatusTrace } from '@vitae/ui';
import { isNodeType, type CapturePlan, type NodeType } from '@vitae/core';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';
import { NodeFormDialog } from './forms/NodeFormDialog.js';
import type { EntityFormValues } from './forms/EntityForm.js';

/**
 * Global quick-add (SRS FR-CAP-001, P04). Parses the capture grammar live via
 * the API preview endpoint and renders chips; Enter commits, Esc closes.
 *
 * FR-022: rendered in a real dialog (CommandOverlay), announced on open, focus
 * contained, focus restored to whatever opened it.
 */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('');
  const [plan, setPlan] = useState<CapturePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullForm, setFullForm] = useState<{ type: NodeType; seed: Partial<EntityFormValues> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { flash } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!value.trim()) {
      setPlan(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await api.post<{ plan: CapturePlan }>('/capture/preview', { raw: value });
        if (alive) setPlan(res.plan);
      } catch {
        // A dead preview must not look like an unparseable line: drop the
        // stale chips rather than leaving the previous parse on screen.
        if (alive) setPlan(null);
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [value]);

  async function commit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/capture', { raw: value });
      await qc.invalidateQueries();
      onClose();
      // The control says Capture; the confirmation says Captured.
      flash(plan?.primaryType && plan.primaryType !== 'unknown' ? `Captured ${plan.primaryType}` : 'Captured');
    } catch (err) {
      // Never fail silently, and never close on failure: the line the user
      // typed is the only copy of it.
      setError(err instanceof Error ? err.message : 'The capture could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  /** Hand the parsed plan to the structured form for detailed entry. */
  function openFullForm() {
    if (!plan || !isNodeType(plan.primaryType as string)) return;
    setFullForm({
      type: plan.primaryType as NodeType,
      seed: {
        title: plan.title || plan.url || '',
        notes_md: plan.notes || '',
        ...(plan.date ? { start_date: plan.date.iso } : {}),
        props: plan.url && plan.primaryType === 'link' ? { url: plan.url } : {},
      },
    });
  }

  if (fullForm) {
    return (
      <NodeFormDialog
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        type={fullForm.type}
        seed={fullForm.seed}
      />
    );
  }

  return (
    <CommandOverlay
      open
      onOpenChange={(o) => !o && onClose()}
      title="Quick add"
      description="Capture a record with the ⌘K grammar. Enter saves, Tab opens the full form."
    >
        <input
          ref={inputRef}
          className="vt-palette__input"
          aria-label="Capture line"
          // One job per element: the placeholder instructs, the cheat row below
          // demonstrates. A full example sentence in a mono field at 17px does
          // both, and reads as text the user already typed.
          placeholder="Capture anything, start with a leading key"
          value={value}
          // The line is the only copy of what was typed, so it stays readable
          // and stays editable while the save is in flight. What it must not
          // do is take a second Enter: `commit` guards on `busy` for that.
          aria-busy={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Tab' && plan && plan.primaryType !== 'unknown') {
              e.preventDefault();
              openFullForm();
            }
            // Escape is handled by the dialog.
          }}
        />
        {/* Saving used to be silent: Enter did nothing visible until the
            overlay closed, so a slow save read as a dropped keystroke and got
            pressed again. */}
        {busy && (
          <StatusTrace
            className="border-t border-hairline px-4 py-3"
            tone="live"
            label="Saving capture"
            detail={plan?.primaryType && plan.primaryType !== 'unknown' ? `as ${plan.primaryType}` : undefined}
          />
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 border-t border-hairline px-4 py-3 text-sm text-danger">
            <Glyph name="close" size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">Capture failed.</strong> {error}
            </span>
          </p>
        )}
        <div className="vt-palette__foot">
          {plan && plan.primaryType !== 'unknown' ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              {plan.chips.map((c, i) => (
                <Chip key={i} tone={c.kind === 'type' ? 'accent' : 'default'} mono={c.kind === 'date'}>
                  {c.kind === 'type' ? c.label : c.kind === 'tag' ? c.label : `${prefix(c.kind)}${c.label}`}
                </Chip>
              ))}
              {isNodeType(plan.primaryType as string) && (
                <button
                  type="button"
                  className="ml-auto inline-flex min-h-8 items-center gap-2 rounded-sm px-2 text-sm text-muted hover:text-ink-strong"
                  onClick={openFullForm}
                >
                  <Kbd>⇥</Kbd> Open full form
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Type a leading key, then details. <Kbd>Enter</Kbd> to save · <Kbd>Esc</Kbd> to cancel
            </p>
          )}
        </div>
        {!value.trim() && (
          <div className="flex flex-wrap gap-2 border-t border-hairline p-4">
            {CHEATS.map((c) => (
              <button
                key={c.key}
                type="button"
                className="inline-flex min-h-6 items-center gap-2 rounded-sm border border-hairline px-2 font-mono text-xs text-muted hover:border-strong hover:text-ink-soft"
                title={c.example}
                aria-label={`Insert an example ${c.label} capture`}
                onClick={() => {
                  setValue(c.example);
                  inputRef.current?.focus();
                }}
              >
                <span className="text-ink-strong">{c.key}</span>
                {c.label}
              </button>
            ))}
          </div>
        )}
    </CommandOverlay>
  );
}

/** Capture-grammar leading keys (core LEADING_KEYS) with clickable examples. */
const CHEATS: Array<{ key: string; label: string; example: string }> = [
  { key: 'p', label: 'person', example: 'p Lina Farouk @@DevFest #ml > met at the speaker dinner' },
  { key: 'o', label: 'org', example: 'o Nile Robotics #robotics' },
  { key: 't', label: 'task', example: 't send Sarah the deck ^fri !2' },
  { key: 'i', label: 'idea', example: 'i résumé atoms as a graph #vitae' },
  { key: 'j', label: 'journal', example: 'j shipped the importer, felt great' },
  { key: 'e', label: 'event', example: 'e DevFest Cairo ^2026-09-12 #conference' },
  { key: 'int', label: 'interaction', example: 'int coffee @Sarah > talked robotics hiring' },
  { key: 'm', label: 'media', example: 'm The Pragmatic Programmer #book' },
  { key: 'l', label: 'link', example: 'l https://arxiv.org/abs/1706.03762 #ml' },
  { key: 'k', label: 'skill', example: 'k reinforcement learning' },
  { key: 'g', label: 'goal', example: 'g publish at a top-tier venue ^2026-12-31' },
  { key: 'h', label: 'habit', example: 'h morning run #health' },
  { key: 'n', label: 'note', example: 'n @Sarah prefers async updates' },
];

/** The capture grammar's own sigils. `note` used an emoji, which the voice
 * rules ban in product surfaces; the grammar's own marker says it better. */
function prefix(kind: string): string {
  return kind === 'person' ? '@ ' : kind === 'org' ? '@@ ' : kind === 'note' ? '> ' : '';
}
