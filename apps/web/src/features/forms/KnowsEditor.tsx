/**
 * The KNOWS edge editor (FR-CON-001) - "the edge IS the relationship".
 * Closeness dots are clickable; cadence auto-fills from CADENCE_BY_CLOSENESS
 * with manual override; topics/met-context/do-not-ping inline. Saves merge
 * into the full existing props so derived fields (strength, favors) survive;
 * the server recomputes strength after every save.
 *
 * The two-column grid had no breakpoint, and the Closeness cell holds a
 * `Rating` whose dots grow to 44px under a coarse pointer. On a phone that is
 * roughly 240px of control in a 150px column, so the dots overran the cadence
 * field beside them. One column below 640px, two above.
 *
 * A failed save was silent in place. `onSuccess` closes the editor, so a
 * failure leaves it open with every edit still in it and nothing saying the
 * relationship did not change; the only report was a toast behind whatever
 * panel this is open in. It states the failure beside the button that retries
 * it now.
 *
 * The Relation select carries its own label as well: a `<label for>` does not
 * name a Radix `<button role="combobox">`, so this field announced only the
 * relation currently showing, next to a closeness radiogroup and a cadence
 * number input that do say what they are.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Inline, Input, Rating, Select, Spread, StatusTrace, TagInput } from '@vitae/ui';
import { CADENCE_BY_CLOSENESS, PERSON_RELATIONS, personRelationLabel } from '@vitae/core';
import { api } from '../../lib/api.js';
import { useToast } from '../Toast.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../../lib/auth.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';

function editableProps(props: Record<string, unknown>) {
  return {
    relation: typeof props.relation === 'string' ? props.relation : '',
    closeness: typeof props.closeness === 'number' ? props.closeness : undefined,
    cadence: props.cadence_target_days != null ? String(props.cadence_target_days) : '',
    topics: Array.isArray(props.topics) ? props.topics.filter((t): t is string => typeof t === 'string') : [],
    metVia: typeof props.met_via === 'string' ? props.met_via : '',
    metOn: typeof props.met_on === 'string' ? props.met_on : '',
    doNotPing: props.do_not_ping === true,
  };
}

export function KnowsEditor({
  personId,
  edgeId,
  knowsProps,
  onDone,
}: {
  personId: string;
  edgeId: string;
  knowsProps: Record<string, unknown>;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const canWrite = useCanWrite();
  const saving = useRef(false);
  const [initial] = useState(() => editableProps(knowsProps));
  const [validation, setValidation] = useState<string | null>(null);
  const [relation, setRelation] = useState<string>(
    typeof knowsProps.relation === 'string' ? knowsProps.relation : '',
  );
  const [closeness, setCloseness] = useState<number | undefined>(
    typeof knowsProps.closeness === 'number' ? knowsProps.closeness : undefined,
  );
  const [cadence, setCadence] = useState<string>(
    knowsProps.cadence_target_days != null ? String(knowsProps.cadence_target_days) : '',
  );
  const [cadenceTouched, setCadenceTouched] = useState(knowsProps.cadence_target_days !== undefined);
  const [topics, setTopics] = useState<string[]>(
    initial.topics,
  );
  const [metVia, setMetVia] = useState<string>(typeof knowsProps.met_via === 'string' ? knowsProps.met_via : '');
  const [metOn, setMetOn] = useState<string>(typeof knowsProps.met_on === 'string' ? knowsProps.met_on : '');
  const [doNotPing, setDoNotPing] = useState<boolean>(knowsProps.do_not_ping === true);

  const suggestedCadence = closeness != null ? CADENCE_BY_CLOSENESS[closeness] : null;
  const dirty = JSON.stringify(initial) !== JSON.stringify({ relation, closeness, cadence, topics, metVia, metOn, doNotPing });
  const conflict = JSON.stringify(initial) !== JSON.stringify(editableProps(knowsProps));

  const save = useMutation({
    mutationFn: () => {
      // Save exactly what the input shows - auto-filled or hand-edited.
      const cadenceValue = cadence.trim() ? Number(cadence) : null;
      return api.patch(`/edges/${edgeId}`, {
        props: {
          ...knowsProps,
          // The summary carries null before the first contact, but the write
          // schema accepts an omitted date, not null. The server derives it.
          last_interaction_at: knowsProps.last_interaction_at ?? undefined,
          relation: relation || undefined,
          closeness,
          cadence_target_days: cadenceValue,
          topics,
          met_via: metVia || undefined,
          met_on: metOn || undefined,
          do_not_ping: doNotPing || undefined,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['person-summary', personId] }),
        qc.invalidateQueries({ queryKey: ['node', personId] }),
        qc.invalidateQueries({ queryKey: ['people'] }),
      ]);
      flash('Relationship updated');
      guard.forceClose();
    },
  });
  const guard = useUnsavedChanges(dirty || save.isPending, { onClose: onDone, busy: save.isPending });

  async function submit() {
    if (saving.current || !canWrite || conflict) return;
    const days = cadence.trim() ? Number(cadence) : null;
    if (days !== null && (!Number.isSafeInteger(days) || days < 1)) {
      setValidation('Enter a whole number of days greater than zero, or leave cadence blank.');
      return;
    }
    if (metOn && (!/^\d{4}-\d{2}-\d{2}$/.test(metOn) || !Number.isFinite(Date.parse(metOn)) || new Date(metOn).toISOString().slice(0, 10) !== metOn)) {
      setValidation('Enter a valid date for when you met.');
      return;
    }
    setValidation(null);
    saving.current = true;
    try { await save.mutateAsync(); } catch { /* Inline error retains the draft. */ }
    finally { saving.current = false; }
  }

  return (
    <>
    <fieldset className="knows-editor" disabled={save.isPending} style={{ minWidth: 0, border: 0, padding: 0, margin: 0 }}>
      <legend className="sr-only">Edit relationship</legend>
      <p className="mb-3 text-sm text-muted">Set how you know this person and when you’d like to reconnect. Leave cadence blank for no target.</p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Relation" help="Friend, colleague, family, mentor, ...">
          <Select
            label={`Relation: ${relation ? (personRelationLabel(relation) ?? relation) : 'not chosen'}`}
            value={relation}
            onChange={(v) => setRelation(v ?? '')}
            options={PERSON_RELATIONS.map((r) => ({
              value: r,
              label: personRelationLabel(r) ?? r,
            }))}
            placeholder="Choose relation..."
            clearable
          />
        </Field>
        <Field label="Closeness" htmlFor="ke-closeness" help="1 = acquaintance · 5 = inner circle">
          <Rating
            id="ke-closeness"
            value={closeness}
            onChange={(v) => {
              setCloseness(v);
              // Auto-fill cadence from the closeness default until overridden.
              if (!cadenceTouched) {
                const suggestion = v != null ? CADENCE_BY_CLOSENESS[v] : null;
                setCadence(suggestion != null ? String(suggestion) : '');
              }
            }}
            label="closeness"
          />
        </Field>
        <Field
          label="Reconnect cadence (days)"
          htmlFor="ke-cadence"
          help={suggestedCadence != null ? `Suggested for closeness ${closeness}: every ${suggestedCadence} days. Your saved cadence stays unchanged.` : 'No suggested cadence. Choose a target or leave it blank.'}
        >
          <Input
            id="ke-cadence"
            mono
            type="number"
            min={1}
            step={1}
            placeholder={suggestedCadence != null ? String(suggestedCadence) : '—'}
            value={cadence}
            onChange={(e) => {
              setCadence(e.target.value);
              setCadenceTouched(true);
            }}
          />
        </Field>
        <Field label="Met via" htmlFor="ke-metvia">
          <Input id="ke-metvia" placeholder="Introduced by Omar" value={metVia} onChange={(e) => setMetVia(e.target.value)} />
        </Field>
        <Field label="Met on" htmlFor="ke-meton">
          <Input id="ke-meton" mono type="date" value={metOn} onChange={(e) => setMetOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Topics" htmlFor="ke-topics" help="What you talk about - feeds 'Who should I call'.">
        <TagInput id="ke-topics" value={topics} onChange={setTopics} placeholder="RL · robotics hiring..." />
      </Field>
      {validation && <StatusTrace className="mt-3" tone="danger" label="Check your details" detail={validation} />}
      {conflict && <StatusTrace className="mt-3" tone="warning" label="Relationship changed" detail="New relationship details arrived while you were editing. Your draft is still here. Cancel and reopen the editor to start from the latest version." />}
      {!canWrite && <p className="text-sm text-muted">{WRITE_LOCK_HINT}</p>}
      {/* No local onError: the query client's MutationCache already announces
          every failure once. What was missing is the message in place. A
          failed save leaves this editor open with the edits still in it, and
          nothing on screen said the relationship had not changed. */}
      {save.isError && (
        <StatusTrace
          className="mt-3"
          tone="danger"
          label="Not saved"
          detail={
            save.error instanceof Error && save.error.message
              ? save.error.message
              : 'We couldn’t confirm the save. Your edits are still here; try again.'
          }
        />
      )}
      <Spread align="center" className="knows-editor__footer">
        <Checkbox
          checked={doNotPing}
          onChange={setDoNotPing}
          label="Exclude from reconnect suggestions"
        />
        <Inline gap={2}>
          <Button type="button" size="sm" disabled={save.isPending} onClick={guard.requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={save.isPending || !canWrite || conflict}
            onClick={() => void submit()}
          >
            {save.isPending ? 'Saving...' : 'Save relationship'}
          </Button>
        </Inline>
      </Spread>
    </fieldset>
    {guard.prompt}
    </>
  );
}
