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
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Inline, Input, Rating, Select, Spread, StatusTrace, TagInput } from '@vitae/ui';
import { CADENCE_BY_CLOSENESS, PERSON_RELATIONS, personRelationLabel } from '@vitae/core';
import { api } from '../../lib/api.js';
import { useToast } from '../Toast.js';

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
  const [relation, setRelation] = useState<string>(
    typeof knowsProps.relation === 'string' ? knowsProps.relation : '',
  );
  const [closeness, setCloseness] = useState<number | undefined>(
    typeof knowsProps.closeness === 'number' ? knowsProps.closeness : undefined,
  );
  const [cadence, setCadence] = useState<string>(
    knowsProps.cadence_target_days != null ? String(knowsProps.cadence_target_days) : '',
  );
  const [cadenceTouched, setCadenceTouched] = useState(false);
  const [topics, setTopics] = useState<string[]>(
    Array.isArray(knowsProps.topics) ? (knowsProps.topics as string[]) : [],
  );
  const [metVia, setMetVia] = useState<string>(typeof knowsProps.met_via === 'string' ? knowsProps.met_via : '');
  const [metOn, setMetOn] = useState<string>(typeof knowsProps.met_on === 'string' ? knowsProps.met_on : '');
  const [doNotPing, setDoNotPing] = useState<boolean>(knowsProps.do_not_ping === true);

  const suggestedCadence = closeness != null ? CADENCE_BY_CLOSENESS[closeness] : null;

  const save = useMutation({
    mutationFn: () => {
      // Save exactly what the input shows - auto-filled or hand-edited.
      const cadenceValue = cadence.trim() ? Number(cadence) : null;
      return api.patch(`/edges/${edgeId}`, {
        props: {
          ...knowsProps,
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
      onDone();
    },
  });

  return (
    <div className="knows-editor">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Relation" help="Friend, colleague, family, mentor, …">
          <Select
            label={`Relation: ${relation ? (personRelationLabel(relation) ?? relation) : 'not chosen'}`}
            value={relation}
            onChange={(v) => setRelation(v ?? '')}
            options={PERSON_RELATIONS.map((r) => ({
              value: r,
              label: personRelationLabel(r) ?? r,
            }))}
            placeholder="Choose relation…"
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
          help={suggestedCadence != null ? `default for closeness ${closeness}: ${suggestedCadence}d` : 'no default - closeness 1 has no cadence'}
        >
          <Input
            id="ke-cadence"
            mono
            type="number"
            min={1}
            placeholder={suggestedCadence != null ? String(suggestedCadence) : '—'}
            value={cadence}
            onChange={(e) => {
              setCadence(e.target.value);
              setCadenceTouched(true);
            }}
          />
        </Field>
        <Field label="Met via" htmlFor="ke-metvia">
          <Input id="ke-metvia" placeholder="intro'd by Omar" value={metVia} onChange={(e) => setMetVia(e.target.value)} />
        </Field>
        <Field label="Met on" htmlFor="ke-meton">
          <Input id="ke-meton" mono type="date" value={metOn} onChange={(e) => setMetOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Topics" htmlFor="ke-topics" help="What you talk about - feeds “Who should I call”.">
        <TagInput id="ke-topics" value={topics} onChange={setTopics} placeholder="RL · robotics hiring…" />
      </Field>
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
              : 'The relationship is unchanged. Your edits are still here; try again.'
          }
        />
      )}
      <Spread align="center">
        <Checkbox
          checked={doNotPing}
          onChange={setDoNotPing}
          label="Do not ping - exclude from reconnect suggestions"
        />
        <Inline gap={2}>
          <Button type="button" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save relationship'}
          </Button>
        </Inline>
      </Spread>
    </div>
  );
}
