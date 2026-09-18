import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Chip, Field, Input, Modal, Stack } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';
import { EntityPicker, type PickedEntity } from '../components/EntityPicker.js';
import { useSelfPerson } from './forms/SubjectPicker.js';
import { useUnsavedChanges } from '../lib/unsaved-changes.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';

/**
 * Log an introduction (SRS FR-COMM-003): who introduced you to this person,
 * when, in what context. Writes the INTRODUCED edge between the two people
 * the introduction connected, crediting the broker in `via` (which feeds
 * broker detection on the rollup and the warm-path hop evidence), and can
 * record the debt in the broker's favor ledger in the same gesture.
 */
export function LogIntroduction({
  open,
  onOpenChange,
  personId,
  personName,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  personId: string;
  personName: string;
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const selfQuery = useSelfPerson();
  const self = selfQuery.data;
  const canWrite = useCanWrite();
  const saving = useRef(false);
  const [broker, setBroker] = useState<PickedEntity | null>(null);
  const [occurredOn, setOccurredOn] = useState('');
  const [context, setContext] = useState('');
  const [creditFavor, setCreditFavor] = useState(false);
  const [favorWarning, setFavorWarning] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [favorKey] = useState(() => crypto.randomUUID());
  const [validation, setValidation] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!self) throw new Error('No self person exists yet; set one in Settings first.');
      if (!broker || broker.id === self.id || broker.id === personId) throw new Error('Pick another person who made the introduction.');
      if (!recorded) {
        await api.post('/edges', {
        type: 'INTRODUCED',
        src: self.id,
        dst: personId,
        props: {
          via: broker.id,
          ...(occurredOn ? { occurred_on: occurredOn } : {}),
          ...(context.trim() ? { context: context.trim() } : {}),
        },
        });
        setRecorded(true);
      }
      if (creditFavor) {
        // The edge stands even if the ledger write fails; the failure is
        // reported, not swallowed.
        try {
          await api.post(`/people/${broker.id}/favors`, {
            direction: 'owed_by_me',
            what: `Introduced me to ${personName}`,
            ...(occurredOn ? { on: occurredOn } : {}),
          }, { idempotencyKey: favorKey });
        } catch (error) {
          setFavorWarning(
            error instanceof Error
              ? `The introduction is recorded, but the favor could not be confirmed: ${error.message}`
              : 'The introduction is recorded, but the favor could not be confirmed.',
          );
          return { favorFailed: true };
        }
      }
      return { favorFailed: false };
    },
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['node'] }),
        qc.invalidateQueries({ queryKey: ['person-correspondence'] }),
        qc.invalidateQueries({ queryKey: ['person-summary'] }),
        qc.invalidateQueries({ queryKey: ['people'] }),
      ]);
      if (!result.favorFailed) {
        guard.forceClose();
        flash(`Introduction recorded · ${broker?.title ?? 'the introducer'} credited`);
      }
    },
  });

  const guard = useUnsavedChanges(open && ((!recorded && Boolean(broker || occurredOn || context || creditFavor)) || save.isPending), {
    onClose: () => onOpenChange(false), busy: save.isPending,
  });
  const canSave = Boolean(self && broker && broker.id !== self.id && broker.id !== personId && canWrite && !save.isPending);
  async function submit() {
    if (saving.current || !canSave) return;
    if (occurredOn && (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || !Number.isFinite(Date.parse(occurredOn)) || new Date(occurredOn).toISOString().slice(0, 10) !== occurredOn)) {
      setValidation('Enter a valid introduction date.');
      return;
    }
    setValidation(null);
    saving.current = true;
    try { await save.mutateAsync(); } catch { /* The inline error keeps the draft. */ }
    finally { saving.current = false; }
  }

  return (
    <>
    <Modal
      open={open}
      onOpenChange={guard.onOpenChange}
      title={`Log an introduction · ${personName}`}
      description={`Record who introduced you to ${personName}. You can also note a favor you owe them.`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" disabled={save.isPending} onClick={guard.requestClose}>
            {recorded ? 'Done' : 'Cancel'}
          </Button>
          <Button type="button" variant="primary" disabled={!canSave} onClick={() => void submit()}>
            {save.isPending ? 'Saving...' : recorded ? 'Retry favor only' : 'Save introduction'}
          </Button>
        </>
      }
    >
      <Stack gap={4} className="person-introduction">
        {!canWrite && <p className="text-sm text-muted">{WRITE_LOCK_HINT}</p>}
        {selfQuery.isPending && <p role="status" className="text-sm text-muted">Loading your person record…</p>}
        {selfQuery.isError && <Banner tone="danger" title="Your person record is unavailable" action={<Button type="button" disabled={selfQuery.isFetching} onClick={() => void selfQuery.refetch()}>{selfQuery.isFetching ? 'Retrying…' : 'Retry your record'}</Button>}>Your introduction draft is still here.</Banner>}
        {!selfQuery.isPending && !selfQuery.isError && !self && <Banner tone="warning" title="Identify your person record first">Set your own person record in Settings before logging an introduction.</Banner>}
        {validation && <Banner tone="danger" title="Check the date">{validation}</Banner>}
        {save.isError && (
          <Banner tone="danger" title="Introduction save not confirmed">
            {save.error instanceof Error ? save.error.message : 'The request did not finish.'} Your draft is still here. Check the person’s connections before trying again if the connection was interrupted.
          </Banner>
        )}
        {favorWarning && (
          <Banner tone="warning" title="Introduction saved · favor needs review">
            {favorWarning}
            <p className="mt-2">Retry favor only checks the same favor request without creating another introduction or favor. Done keeps the introduction.</p>
          </Banner>
        )}
        <fieldset disabled={save.isPending || recorded || !canWrite} className="person-introduction__fields">
        <legend className="sr-only">Introduction details</legend>
        <div className="vt-fld">
          <span className="vt-fld__label">Introduced by</span>
          {broker ? (
            <div className="flex items-center gap-2">
              <Chip>{broker.title}</Chip>
              <Button type="button" size="sm" variant="ghost" onClick={() => setBroker(null)}>
                Change
              </Button>
            </div>
          ) : (
            <EntityPicker
              types={['person']}
              excludeIds={[personId, ...(self ? [self.id] : [])]}
              allowCreate={false}
              onPick={setBroker}
              placeholder="Who made the introduction?"
            />
          )}
        </div>

        <Field label="When" htmlFor="log-intro-on" help="Optional">
          <Input
            id="log-intro-on"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </Field>

        <Field label="Context" htmlFor="log-intro-context" help="Optional">
          <Input
            id="log-intro-context"
            placeholder="conference hallway, a thread, ..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={creditFavor}
            onChange={(e) => setCreditFavor(e.target.checked)}
          />
          Record a favor I owe the person who introduced us
        </label>
        </fieldset>
      </Stack>
    </Modal>
    {guard.prompt}
    </>
  );
}
