import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Chip, Field, Input, Modal, Stack } from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from './Toast.js';
import { EntityPicker, type PickedEntity } from '../components/EntityPicker.js';
import { useSelfPerson } from './forms/SubjectPicker.js';

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
  const { data: self } = useSelfPerson();
  const [broker, setBroker] = useState<PickedEntity | null>(null);
  const [occurredOn, setOccurredOn] = useState('');
  const [context, setContext] = useState('');
  const [creditFavor, setCreditFavor] = useState(false);
  const [favorWarning, setFavorWarning] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!self) throw new Error('No self person exists yet; set one in Settings first.');
      if (!broker) throw new Error('Pick the person who made the introduction.');
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
      if (creditFavor) {
        // The edge stands even if the ledger write fails; the failure is
        // reported, not swallowed.
        try {
          await api.post(`/people/${broker.id}/favors`, {
            direction: 'owed_by_me',
            what: `Introduced me to ${personName}`,
            ...(occurredOn ? { on: occurredOn } : {}),
          });
        } catch (error) {
          setFavorWarning(
            error instanceof Error
              ? `The introduction is recorded, but the favor was not: ${error.message}`
              : 'The introduction is recorded, but the favor was not.',
          );
          return { favorFailed: true };
        }
      }
      return { favorFailed: false };
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries();
      if (!result.favorFailed) {
        onOpenChange(false);
        flash(`Introduction recorded · ${broker?.title ?? 'the broker'} credited`);
      }
    },
  });

  const canSave = broker !== null && !save.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Log an introduction · ${personName}`}
      description={`Record who introduced you to ${personName}, so brokers and warm paths can cite it.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving...' : 'Save introduction'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {save.isError && (
          <Banner tone="danger" title="This introduction was not recorded">
            {save.error instanceof Error ? save.error.message : 'Try Save again.'}
          </Banner>
        )}
        {favorWarning && (
          <Banner tone="warning" title="Favor not recorded">
            {favorWarning}
          </Banner>
        )}

        <div className="vt-fld">
          <span className="vt-fld__label">Introduced by</span>
          {broker ? (
            <div className="flex items-center gap-2">
              <Chip>{broker.title}</Chip>
              <Button size="sm" variant="ghost" onClick={() => setBroker(null)}>
                Change
              </Button>
            </div>
          ) : (
            <EntityPicker
              types={['person']}
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
          Record it in the broker's favor ledger (owed by me)
        </label>
      </Stack>
    </Modal>
  );
}
